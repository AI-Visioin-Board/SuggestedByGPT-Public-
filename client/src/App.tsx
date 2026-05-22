import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import { theme } from "./theme";
import HomeNew from "./pages/HomeNew";
import PortalV2 from "./pages/PortalV2";
import About from "./pages/About";
import Blog from "./pages/Blog";
import BlogPost from "./pages/BlogPost";
import GetStarted from "./pages/GetStarted";
import ClientPortal from "./pages/ClientPortal";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentCancel from "./pages/PaymentCancel";
import AdminDashboard from "./pages/AdminDashboard";
import AssistantDashboard from "./pages/AssistantDashboard";
import AnalyticsDashboard from "./pages/AnalyticsDashboard";
import Login from "./pages/Login";
import RedditAccountsPage from "./pages/RedditAccountsPage";
import Scan from "./pages/Scan";
import FunnelStart from "./pages/FunnelStart";
import Support from "./pages/Support";
import SelectAccount from "./pages/SelectAccount";
import Terms from "./pages/Terms";
import PrivacyPolicy from "./pages/PrivacyPolicy";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={HomeNew} />
      <Route path={"/about"} component={About} />
      <Route path={"/blog"} component={Blog} />
      <Route path={"/blog/:slug"} component={BlogPost} />
      <Route path={"/get-started"} component={GetStarted} />
      <Route path={"/login"} component={Login} />
      <Route path={"/portal"} component={PortalV2} />
      <Route path={"/portal/select-account"} component={SelectAccount} />
      <Route path={"/portal-legacy"} component={ClientPortal} />
      <Route path={"/start"} component={FunnelStart} />
      <Route path={"/scan"} component={Scan} />
      <Route path={"/support"} component={Support} />
      <Route path={"/terms"} component={Terms} />
      <Route path={"/privacy"} component={PrivacyPolicy} />
      <Route path={"/payment/success"} component={PaymentSuccess} />
      <Route path={"/payment/cancel"} component={PaymentCancel} />
      <Route path={"/admin"} component={AdminDashboard} />
      <Route path={"/admin/analytics"} component={AnalyticsDashboard} />
      <Route path={"/admin/reddit-accounts"} component={RedditAccountsPage} />
      <Route path={"/assistant"} component={AssistantDashboard} />
      <Route path={"/assistant/reddit-accounts"} component={RedditAccountsPage} />
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
      >
        <MuiThemeProvider theme={theme}>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </MuiThemeProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
