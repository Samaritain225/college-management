import { useState, useEffect, useRef } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSettings } from "@/lib/settings"
import { useAuth } from "@/lib/auth"
import { focusFirstInvalidField } from "@/lib/formFocus"
import { loginFormSchema, type LoginFormValues } from "./loginFormSchema"
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

  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    mode: "onTouched",
    defaultValues: { email: "", password: "" },
  })
  const [showPassword, setShowPassword] = useState(false)
  // Deliberately not `loginForm.formState.isSubmitting`: when captcha is
  // enabled, the actual login happens later, inside Turnstile's `onSuccess`
  // callback — outside the promise `handleSubmit` awaits — so RHF's own
  // submitting flag would flip back to false the instant `captchaRef.current
  // .execute()` returns, long before the login round trip actually finishes.
  const [submitting, setSubmitting] = useState(false)
  const [quoteIndex, setQuoteIndex] = useState(0)
  const [fadeState, setFadeState] = useState<"in" | "out">("in")

  const captchaRef = useRef<TurnstileInstance>(null)
  const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined
  // Disabled until a real site key is configured (Cloudflare dash + the
  // Turnstile secret set as the CAPTCHA provider in Supabase Dashboard >
  // Authentication > Attack Protection) — rather than rendering a widget
  // pointed at a placeholder key. Login falls back to no verification below;
  // it turns itself back on the moment the env var is set, no code change.
  const captchaEnabled = Boolean(siteKey)

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

  const executeLogin = async (token?: string) => {
    // Read live rather than captured — Turnstile's `onSuccess` calls this
    // well after the initial submit, so a closed-over value could be stale.
    const { email, password } = loginForm.getValues()
    try {
      const user = await login(email, password, token)
      toast.success(`Bon retour, ${user.name} !`)
    } catch (err) {
      captchaRef.current?.reset()
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

  const handleSubmit = loginForm.handleSubmit(
    () => {
      if (submitting) return
      setSubmitting(true)

      if (captchaRef.current) {
        captchaRef.current.execute()
      } else {
        executeLogin()
      }
    },
    (errors) => focusFirstInvalidField(errors, ["email", "password"], loginForm.setFocus)
  )

  return (
    <div className="relative flex min-h-screen w-screen bg-paper font-sans">
      {/* Artwork layer.
          One <picture>, two jobs: full-bleed background on mobile, right-hand
          panel from md up. Previously this lived only in the desktop column as
          `hidden md:flex` — but display:none does not stop the fetch, so phones
          downloaded 591KB of artwork they never rendered. Now the media
          attributes mean exactly one right-sized file is fetched per viewport
          (mobile ~24KB, desktop ~37KB), and mobile actually shows it. */}
      <div className="pointer-events-none absolute inset-0 z-0 select-none md:left-1/2 md:p-4 lg:p-6">
        <div className="relative h-full w-full overflow-hidden md:rounded-2xl md:border md:border-white/10 md:shadow-lg">
          <picture>
            <source media="(min-width: 768px)" type="image/avif" srcSet="/login-artwork-desktop.avif" />
            <source media="(min-width: 768px)" type="image/webp" srcSet="/login-artwork-desktop.webp" />
            <source type="image/avif" srcSet="/login-artwork-mobile.avif" />
            <source type="image/webp" srcSet="/login-artwork-mobile.webp" />
            <img
              src="/login-artwork-desktop.webp"
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
            />
          </picture>
          {/* Scrim. Heavier on mobile, where the form sits directly on top of
              the image rather than beside it. */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/65 to-black/50 md:from-black/80 md:via-black/30 md:to-black/20" />

          {/* Fading quotes container */}
          <div className="absolute bottom-6 left-5 right-5 z-10 max-w-2xl md:bottom-8 md:left-8 md:right-8">
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

            <div className="relative flex flex-col items-start bg-black/45 backdrop-blur-md rounded-2xl p-4 md:p-6 transition-all duration-500 ease-in-out w-full">
              <p
                className={`text-sm md:text-xl font-medium text-white/95 leading-relaxed transition-all duration-500 transform ${
                  fadeState === "in"
                    ? "opacity-100 translate-x-0 blur-none"
                    : "opacity-0 -translate-x-4 blur-xs"
                }`}
              >
                " {quotes[quoteIndex].text} "
              </p>

              <div className="flex items-center gap-2.5 mt-3 pt-3 md:mt-4 border-t border-white/5 w-full text-white/90">
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

      {/* Form column. Transparent on mobile so the artwork reads through;
          solid paper from md up, where it owns the left half. The extra bottom
          padding keeps the centred card clear of the quote on phones. */}
      <div className="relative z-10 flex w-full flex-col justify-center px-6 pt-12 pb-56 md:w-1/2 md:bg-paper md:py-12 lg:px-16 xl:px-24">
        <div className="mx-auto w-full max-w-sm space-y-8">
          {/* Logo / Header — light type on mobile, where it sits over the
              scrimmed artwork rather than on paper. */}
          <div className="flex flex-col items-center text-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal-950 text-white font-display font-semibold text-lg overflow-hidden shadow-xs">
              {collegeLogo ? (
                <img src={collegeLogo} alt="Logo" className="h-full w-full object-cover" />
              ) : (
                collegeName.charAt(0).toUpperCase()
              )}
            </div>
            <div>
              <h2 className="text-xl font-display font-bold tracking-tight text-white md:text-ink">
                Connexion · {collegeName}
              </h2>
              <p className="text-xs text-white/75 mt-1 md:text-ink-soft">
                Accédez à votre espace de gestion budgétaire
              </p>
            </div>
          </div>

          {/* Login Card */}
          <Card className="border border-ink/10 bg-paper/95 backdrop-blur-md shadow-lg md:bg-paper md:shadow-xs">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-display font-semibold flex items-center gap-2 text-ink">
                <Lock className="size-4 text-ink-soft" />
                Saisir vos identifiants
              </CardTitle>
            </CardHeader>
            <CardContent>
              {/* noValidate — native `required` blocks React's `onSubmit`
                  before it ever fires, which would make the zod error
                  messages below unreachable. See AGENTS.md. */}
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="login-email" className="text-xs font-display font-medium text-ink">Email professionnel</Label>
                  <Input
                     id="login-email"
                     type="email"
                     {...loginForm.register("email")}
                     placeholder="Veuillez saisir votre email"
                     aria-invalid={!!loginForm.formState.errors.email}
                     className="border-ink/15 bg-paper text-ink text-sm"
                     required
                     disabled={submitting}
                  />
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-negative font-medium">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="login-password" className="text-xs font-display font-medium text-ink">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="login-password"
                      type={showPassword ? "text" : "password"}
                      {...loginForm.register("password")}
                      placeholder="••••••••"
                      aria-invalid={!!loginForm.formState.errors.password}
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
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-negative font-medium">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>

                {/* Invisible Cloudflare Turnstile verification — only mounted
                    once a real site key is configured; see captchaEnabled. */}
                {captchaEnabled && (
                  <Turnstile
                    ref={captchaRef}
                    siteKey={siteKey!}
                    options={{ size: "invisible", execution: "execute" }}
                    onSuccess={(token) => executeLogin(token)}
                    onError={() => {
                      setSubmitting(false)
                      toast.error("Vérification de sécurité échouée. Veuillez réessayer.")
                    }}
                  />
                )}

                <Button type="submit" className="w-full mt-2 font-display" disabled={submitting}>
                  {submitting ? "Connexion en cours…" : "Se connecter"}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
