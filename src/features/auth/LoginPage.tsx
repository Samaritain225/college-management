import React, { useState, useEffect } from "react"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSettings } from "@/lib/settings"
import { useAuth } from "@/lib/auth"
import { Lock, Pencil, Eye, EyeOff } from "lucide-react"
import { toast } from "sonner"

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
  { text: "Les portes de la sagesse ne sont jamais fermées à ceux qui veulent apprendre.", author: "Benjamin Franklin" },
]

export function LoginPage() {
  const { collegeName, collegeLogo } = useSettings()
  const { login } = useAuth()

  const [email, setEmail] = useState("admin@college.ci")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [submitting, setSubmitting] = useState(false)
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)

    try {
      const user = await login(email, password)
      toast.success(`Bon retour, ${user.name} !`)
    } catch (err) {
      // Supabase's own guidance: match on .code/.name, never on message text.
      const code = (err as { code?: string } | undefined)?.code
      const status = (err as { status?: number } | undefined)?.status

      if (code === "user_banned") {
        toast.error("Compte désactivé. Veuillez contacter un administrateur.", { duration: 10000 })
      } else if (code === "invalid_credentials") {
        toast.error("Identifiants incorrects.")
      } else if (status === undefined) {
        // No HTTP status at all means the request never reached the server.
        toast.error("Impossible de contacter le serveur — vérifiez votre connexion.")
      } else {
        toast.error((err as Error)?.message || "Une erreur inattendue est survenue. Réessayez.")
      }
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen w-screen bg-paper font-sans">
      {/* Left Column: Form Panel */}
      <div className="flex w-full flex-col justify-center px-6 py-12 md:w-1/2 lg:px-16 xl:px-24 bg-paper">
        <div className="mx-auto w-full max-w-sm space-y-8">
          {/* Logo / Header */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-950 text-white font-display font-semibold text-lg overflow-hidden shadow-xs">
              {collegeLogo ? (
                <img src={collegeLogo} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                collegeName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-xl font-display font-bold tracking-tight text-ink">
                Connexion · {collegeName}
              </h2>
              <p className="text-xs text-ink-soft mt-1">
                Accédez à votre espace de gestion budgétaire
              </p>
            </div>
          </div>

          {/* Login Card */}
          <Card className="border border-ink/10 bg-paper shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display font-semibold flex items-center gap-2 text-ink">
                <Lock className="size-4 text-ink-soft" />
                Saisir vos identifiants
              </CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-xs font-display font-medium text-ink">Email professionnel</Label>
                  <Input
                     id="login-email"
                     type="email"
                     value={email}
                     onChange={(e) => setEmail(e.target.value)}
                     placeholder="nom@college.ci"
                     className="border-ink/15 bg-paper text-ink text-sm"
                     required
                     disabled={submitting}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs font-display font-medium text-ink">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="pr-10 border-ink/15 bg-paper text-ink text-sm"
                      required
                      disabled={submitting}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink focus:outline-hidden"
                    >
                      {showPassword ? (
                        <EyeOff className="size-4" />
                      ) : (
                        <Eye className="size-4" />
                      )}
                    </button>
                  </div>
                </div>

                <Button type="submit" className="w-full mt-2 font-display" disabled={submitting}>
                  {submitting ? "Connexion en cours…" : "Se connecter"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Right Column: Visual Artwork (hidden on small devices) */}
      <div className="hidden w-1/2 md:flex items-center justify-center p-4 lg:p-6 select-none bg-paper">
        <div className="relative w-full h-full overflow-hidden rounded-2xl border border-border/40 shadow-lg">
          {/* Full screen image layout */}
          <img
            src="/login-artwork.png"
            alt="College Budget"
            className="absolute inset-0 w-full h-full object-cover"
          />
          {/* Dark overlay for readability */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-black/20" />

          {/* Fading quotes container */}
          <div className="absolute bottom-8 left-8 right-8 z-10 max-w-2xl">
            <svg className="absolute inset-0 w-full h-full pointer-events-none" style={{ overflow: "visible" }}>
              <defs>
                <linearGradient id="ants-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" className="gradient-stop-1" />
                  <stop offset="50%" className="gradient-stop-2" />
                  <stop offset="100%" className="gradient-stop-3" />
                </linearGradient>
              </defs>
              <rect
                x="0"
                y="0"
                width="100%"
                height="100%"
                rx="16"
                fill="none"
                stroke="url(#ants-gradient)"
                strokeWidth="2"
                className="marching-ants-border opacity-70"
              />
            </svg>

            <div className="relative flex flex-col items-start bg-black/45 backdrop-blur-md rounded-2xl p-6 transition-all duration-500 ease-in-out w-full">
              <p
                className={`text-lg md:text-xl font-medium text-white/95 leading-relaxed transition-all duration-500 transform ${
                  fadeState === "in"
                    ? "opacity-100 translate-x-0 blur-none"
                    : "opacity-0 -translate-x-4 blur-xs"
                }`}
              >
                " {quotes[quoteIndex].text} "
              </p>

              <div className="flex items-center gap-2.5 mt-4 pt-3 border-t border-white/5 w-full text-white/90">
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-paper/15 text-white shadow-xs">
                  <Pencil className="size-3" />
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
      </div>
    </div>
  )
}
