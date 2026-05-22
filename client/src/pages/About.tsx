import { Button } from "@/components/ui/button";
import { ArrowLeft, Sparkles } from "lucide-react";
import { Link } from "wouter";

export default function About() {
  return (
    <div className="min-h-screen">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass border-b">
        <div className="container mx-auto flex items-center justify-between h-20">
          <Link href="/">
            <a className="flex items-center gap-2 text-2xl font-bold tracking-tight" style={{ fontFamily: "var(--font-display)" }}>
              <Sparkles className="w-7 h-7 text-primary" />
              <span className="bg-gradient-to-r from-primary to-[oklch(0.72_0.15_65)] bg-clip-text text-transparent">
                SuggestedByGPT
              </span>
            </a>
          </Link>
          <Link href="/">
            <Button variant="ghost" className="gap-2">
              <ArrowLeft className="w-4 h-4" />
              Back to Home
            </Button>
          </Link>
        </div>
      </nav>

      <main className="pt-32 pb-20">
        <div className="container max-w-4xl">
          <div className="space-y-12">
            <div className="space-y-6">
              <h1 className="text-5xl md:text-6xl font-extrabold">About Us</h1>
              <p className="text-xl text-muted-foreground leading-relaxed">
                We're on a mission to help businesses thrive in the age of AI recommendations.
              </p>
            </div>

            <div className="prose prose-lg max-w-none space-y-6">
              <p className="text-lg leading-relaxed">
                In 2026, the way people discover businesses has fundamentally changed. Instead of scrolling through search results, 
                they're asking ChatGPT, Gemini, and Claude for recommendations. And if your business isn't optimized for AI, 
                you're invisible.
              </p>

              <p className="text-lg leading-relaxed">
                We started SuggestedByGPT because we saw this shift happening and realized that most businesses had no idea 
                how to adapt. The technical requirements—schema markup, entity optimization, knowledge graph synchronization—are 
                complex and time-consuming. Business owners shouldn't have to become AI experts just to stay competitive.
              </p>

              <p className="text-lg leading-relaxed">
                That's why we built a 90% done-for-you service. We handle the heavy lifting — the audits, the optimizations, the technical installations.
                We just need a little help from you along the way, like website access and quick approvals on visible changes. No technical knowledge required.
              </p>

              <h2 className="text-3xl font-bold mt-12 mb-6">Our Values</h2>

              <div className="grid md:grid-cols-2 gap-6 not-prose">
                <div className="glass rounded-xl p-6 space-y-3">
                  <h3 className="text-xl font-bold">Speed</h3>
                  <p className="text-muted-foreground">
                    We deliver results in 24 hours because every day you wait is a day your competitors are being recommended instead of you.
                  </p>
                </div>

                <div className="glass rounded-xl p-6 space-y-3">
                  <h3 className="text-xl font-bold">Simplicity</h3>
                  <p className="text-muted-foreground">
                    We handle all the technical complexity so you can focus on running your business.
                  </p>
                </div>

                <div className="glass rounded-xl p-6 space-y-3">
                  <h3 className="text-xl font-bold">Transparency</h3>
                  <p className="text-muted-foreground">
                    You get a detailed report showing exactly what we did and how it helps your AI visibility.
                  </p>
                </div>

                <div className="glass rounded-xl p-6 space-y-3">
                  <h3 className="text-xl font-bold">Results</h3>
                  <p className="text-muted-foreground">
                    We're not satisfied until AI platforms are actively recommending your business to users.
                  </p>
                </div>
              </div>

              <p className="text-lg leading-relaxed mt-12">
                If you're ready to get your business suggested by GPT, we're ready to make it happen.
              </p>
            </div>

            <div className="pt-8">
              <Link href="/">
                <Button size="lg" className="font-semibold">
                  Get Started Today
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t glass py-12">
        <div className="container text-center text-sm text-muted-foreground">
          <p>&copy; 2026 SuggestedByGPT. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
