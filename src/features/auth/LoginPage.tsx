import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSettings } from "@/lib/settings"
import { Lock, Pencil, Eye, EyeOff } from "lucide-react"

interface LoginPageProps {
  onLogin: () => void
}

const quotes = [
  { text: "L'éducation est l'arme la plus puissante pour changer le monde.", author: "Nelson Mandela" },
  { text: "L'art suprême de l'enseignant est d'éveiller la joie dans l'expression créative et la connaissance.", author: "Albert Einstein" },
  { text: "Si vous pensez que l'éducation coûte cher, essayez l'ignorance.", author: "Andy McIntyre" },
  { text: "L'école doit être un lieu où chaque enfant se sent valorisé et encouragé à réussir.", author: "Malala Yousafzai" },
  { text: "L'enseignement doit être tel que ce qui est offert soit perçu comme un cadeau précieux.", author: "Albert Einstein" },
  { text: "On n'apprend pas pour l'école, mais pour la vie.", author: "Sénèque" },
  { text: "Le but de l'éducation est de remplacer un esprit vide par un esprit ouvert.", author: "Malcolm Forbes" },
  { text: "Investir dans l'éducation, c'est investir dans le plus grand des biens.", author: "Platon" },
  { text: "L'éducation est notre passeport pour l'avenir, car demain appartient à ceux qui s'y préparent aujourd'hui.", author: "Malcolm X" },
  { text: "Les portes de la sagesse ne sont jamais fermées à ceux à qui veulent apprendre.", author: "Benjamin Franklin" },
]

export function LoginPage({ onLogin }: LoginPageProps) {
  const { collegeName, collegeLogo } = useSettings()
  const [email, setEmail] = useState("admin@college.ci")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [fadeState, setFadeState] = useState<"in" | "out">("in")

  useEffect(() => {
    const interval = setInterval(() => {
      setFadeState("out")
      setTimeout(() => {
        setQuoteIndex((prev) => (prev + 1) % quotes.length)
        setFadeState("in")
      }, 600)
    }, 10000)

    return () => clearInterval(interval)
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    onLogin()
  }

  return (
    <div className="flex min-h-screen w-screen bg-slate-50 font-sans">
      {/* Left Column: Form Panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 md:w-1/2 lg:px-16 xl:px-24 bg-card border-r border-border">
        <div className="mx-auto w-full max-w-sm space-y-8">
          {/* Logo / Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground font-semibold text-lg overflow-hidden shadow-xs">
              {collegeLogo ? (
                <img src={collegeLogo} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                collegeName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold tracking-tight text-foreground">
                Connexion · {collegeName}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                Accédez à votre espace de gestion budgétaire hors-ligne
              </p>
            </div>
          </div>

          {/* Login Card */}
          <Card className="border border-border/80 shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-semibold flex items-center gap-2">
                <Lock className="size-4 text-muted-foreground" />
                Saisir vos identifiants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email professionnel</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@college.ci"
                    required
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Mot de passe / PIN</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••"
                      className="pr-10"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground focus:outline-hidden"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full mt-2">
                  Se connecter
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Seed accounts reference info */}
          <div className="rounded-lg bg-slate-100/50 p-4 border border-border/50">
            <h3 className="text-2xs font-semibold text-foreground tracking-wider uppercase mb-1">
              Identifiants de démonstration
            </h3>
            <p className="text-3xs text-muted-foreground leading-relaxed">
              Email : <span className="font-mono text-foreground select-all">admin@college.ci</span>
              <br />
              Code PIN / MDP : <span className="font-mono text-foreground select-all">1234</span>
            </p>
          </div>
        </div>
      </div>

      {/* Right Column: Visual Artwork (hidden on small devices) */}
      <div className="relative hidden w-1/2 md:flex overflow-hidden select-none">
        {/* Full screen image layout */}
        <img
          src="/login-artwork.png"
          alt="Wagnon Budget"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />

        {/* Fading and layout-adaptive quotes container at the bottom */}
        <div className="absolute bottom-8 left-12 right-12 z-10 flex flex-col items-start bg-black/10 backdrop-blur-xs border border-white/5 rounded-2xl p-6 transition-all duration-500 ease-in-out max-w-2xl">
          {/* Quote Text */}
          <p
            className={`text-lg md:text-xl font-medium text-white/95 leading-relaxed transition-all duration-500 transform ${
              fadeState === "in"
                ? "opacity-100 translate-x-0 blur-none"
                : "opacity-0 -translate-x-4 blur-xs"
            }`}
          >
            “ {quotes[quoteIndex].text} ”
          </p>

          {/* Divider & Author */}
          <div className="flex items-center gap-2.5 mt-4 pt-3 border-t border-white/5 w-full text-white/90">
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-white shadow-xs">
              <Pencil className="size-3.5 fill-white/10" />
            </div>
            <span
              className={`text-xs md:text-sm font-semibold tracking-wide transition-all duration-500 transform ${
                fadeState === "in"
                  ? "opacity-100 translate-y-0"
                  : "opacity-0 translate-y-2"
              }`}
            >
              {quotes[quoteIndex].author}
            </span>
          </div>
        </div>
      </div>
    </div>
  )
}
