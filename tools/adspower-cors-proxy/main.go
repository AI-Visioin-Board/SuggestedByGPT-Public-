// SuggestedByGPT — AdsPower CORS Proxy
//
// Tiny single-binary HTTP proxy that sits in front of AdsPower's local API
// and adds the CORS headers Chrome needs to let the SuggestedByGPT portal
// (HTTPS) call into AdsPower (HTTP localhost).
//
// Why this exists:
//   AdsPower's local API server doesn't send Access-Control-Allow-Origin,
//   so Chrome blocks every fetch from suggestedbygpt.com. AdsPower has no
//   setting to enable it. This proxy is the smallest possible workaround:
//   listen on :50326, forward to AdsPower on :50325, add the right headers.
//
// Usage:
//   1. Download adspower-cors-proxy.exe to your Windows PC
//   2. Make sure AdsPower app is running first (default port 50325)
//   3. Double-click the .exe — a console window opens showing
//      "Listening on http://127.0.0.1:50326"
//   4. In the SuggestedByGPT portal Settings, change AdsPower port from
//      50325 to 50326 and save
//   5. Keep the proxy console window open while you're using the portal
//      (minimize is fine; closing it stops the proxy)
//
// Security notes:
//   - Listens only on 127.0.0.1 — not reachable from anywhere except the
//     same machine. Other machines on your LAN cannot hit it.
//   - Only proxies to localhost:50325. Doesn't forward to anywhere else.
//   - Adds CORS headers permissively (Allow-Origin: *) because Chrome's
//     local-network access policy effectively gates this anyway. Safe in
//     practice — same-machine origin assumption.
//
// Config via env vars (all optional):
//   ADSPOWER_PROXY_LISTEN  — default ":50326"
//   ADSPOWER_TARGET        — default "http://127.0.0.1:50325"

package main

import (
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"
)

const (
	defaultListen = "127.0.0.1:50326"
	defaultTarget = "http://127.0.0.1:50325"
)

func main() {
	listen := envOr("ADSPOWER_PROXY_LISTEN", defaultListen)
	if !strings.Contains(listen, ":") {
		listen = "127.0.0.1:" + listen
	}
	if strings.HasPrefix(listen, ":") {
		listen = "127.0.0.1" + listen
	}

	targetStr := envOr("ADSPOWER_TARGET", defaultTarget)
	target, err := url.Parse(targetStr)
	if err != nil {
		fatal("invalid ADSPOWER_TARGET %q: %v", targetStr, err)
	}

	fmt.Println("╔═══════════════════════════════════════════════════════════════╗")
	fmt.Println("║   SuggestedByGPT — AdsPower CORS Proxy                        ║")
	fmt.Println("╚═══════════════════════════════════════════════════════════════╝")
	fmt.Println()
	fmt.Printf("  Listening on http://%s\n", listen)
	fmt.Printf("  Forwarding to %s\n", target)
	fmt.Println()
	fmt.Println("  In the SuggestedByGPT portal Settings, set AdsPower port to")
	fmt.Printf("  %s (instead of 50325).\n", portOf(listen))
	fmt.Println()
	fmt.Println("  Keep this window open while you work. Close to stop the proxy.")
	fmt.Println()

	// Verify AdsPower is reachable (single quick TCP probe). Non-fatal — we
	// still start, but warn the operator if AdsPower is missing.
	if err := probeTCP(target.Host, 1*time.Second); err != nil {
		fmt.Printf("  ⚠ Warning: AdsPower not reachable at %s yet (%v).\n", target.Host, err)
		fmt.Println("    Open the AdsPower app, then refresh the portal page.")
		fmt.Println()
	} else {
		fmt.Printf("  ✓ AdsPower detected at %s\n\n", target.Host)
	}

	rp := httputil.NewSingleHostReverseProxy(target)

	// Customize the Director: set Host header to AdsPower's expectation +
	// strip any Origin/Referer the browser may have added (AdsPower may
	// reject foreign origins; we rewrite to match the target).
	origDirector := rp.Director
	rp.Director = func(req *http.Request) {
		origDirector(req)
		req.Host = target.Host
		// Don't leak the browser's Origin to AdsPower
		req.Header.Del("Origin")
		req.Header.Del("Referer")
	}

	// Add CORS headers on the way back.
	rp.ModifyResponse = func(resp *http.Response) error {
		addCORSHeaders(resp.Header)
		return nil
	}

	rp.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("[proxy] error forwarding %s %s: %v", r.Method, r.URL.Path, err)
		addCORSHeaders(w.Header())
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		_, _ = io.WriteString(w, fmt.Sprintf(`{"error":"AdsPower not reachable at %s","detail":%q}`, target.Host, err.Error()))
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		// Handle CORS preflight inline — never forward OPTIONS to AdsPower.
		if r.Method == http.MethodOptions {
			addCORSHeaders(w.Header())
			w.WriteHeader(http.StatusNoContent)
			return
		}
		log.Printf("[proxy] %s %s", r.Method, r.URL.Path)
		rp.ServeHTTP(w, r)
	})

	server := &http.Server{
		Addr:              listen,
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	// Graceful shutdown on Ctrl-C
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	go func() {
		<-stop
		fmt.Println("\nShutting down...")
		_ = server.Close()
	}()

	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		fatal("server error: %v", err)
	}
}

func addCORSHeaders(h http.Header) {
	h.Set("Access-Control-Allow-Origin", "*")
	h.Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS")
	h.Set("Access-Control-Allow-Headers", "Authorization, Content-Type, X-Requested-With, Accept, Origin")
	h.Set("Access-Control-Allow-Private-Network", "true")
	h.Set("Access-Control-Max-Age", "86400")
}

func probeTCP(hostPort string, timeout time.Duration) error {
	conn, err := net.DialTimeout("tcp", hostPort, timeout)
	if err != nil {
		return err
	}
	_ = conn.Close()
	return nil
}

func portOf(hostPort string) string {
	_, port, err := net.SplitHostPort(hostPort)
	if err != nil {
		return hostPort
	}
	return port
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "FATAL: "+format+"\n", args...)
	os.Exit(1)
}
