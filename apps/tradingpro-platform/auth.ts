// auth.ts
// @ts-nocheck
import { prisma } from "@/lib/prisma"
import { signInSchema, mobileSignInSchema, sessionSecurityStepUpSchema } from "@/schemas"
import { PrismaAdapter } from "@auth/prisma-adapter"
import NextAuth from "next-auth"
import CredentialsProvider from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"
import { getUserById, getUserByIdentifier } from "./data/user"
import { getAuthRoute } from "@/lib/branding-routes"
import { finalizeCredentialLogin, type FinalizedCredentialUser } from "@/lib/session-security/login-finalize"
import { consumeSessionSecurityStepUpWithMpin } from "@/lib/session-security/step-up"
import { authSessionDebug, prefixId } from "@/lib/auth-session-debug"
import {
    evaluateJtiSession,
    mintLegacyCredentialJtiIfPolicyEnabled,
    revokeJti,
    touchSessionByJti,
} from "@/lib/session-security/registry"
import { resolveAccountAccess } from "@/lib/auth/account-access-policy"
import { canonicalEmailForPersistence } from "@/lib/identity/user-contact-canonical"

/**
 * NextAuth Configuration
 * Handles authentication for both web and mobile platforms
 */
export const authOptions = {
    adapter: PrismaAdapter(prisma),
    providers: [
        CredentialsProvider({
            name: "credentials",
            credentials: {
                email: {},
                password: {},
                identifier: {},
                sessionToken: {},
                stepUpChallengeId: {},
                sessionSecurityMpin: {},
            },
            async authorize(credentials, request) {
                const finalize = async (user, sessionAuth) => {
                    if (!user || !request) return null
                    return finalizeCredentialLogin({
                        user,
                        request,
                        sessionAuth: sessionAuth ?? null,
                        action: "login",
                    })
                }

                const stepUpMaybe = sessionSecurityStepUpSchema.safeParse({
                    email: credentials?.email,
                    stepUpChallengeId: credentials?.stepUpChallengeId,
                    mpin: credentials?.sessionSecurityMpin,
                })
                if (stepUpMaybe.success && credentials?.stepUpChallengeId && credentials?.sessionSecurityMpin) {
                    if (!request) return null
                    const { email, stepUpChallengeId, mpin } = stepUpMaybe.data
                    const emailKey = canonicalEmailForPersistence(email)
                    const user = await prisma.user.findUnique({ where: { email: emailKey } })
                    if (!user) return null
                    const verify = await consumeSessionSecurityStepUpWithMpin({
                        challengeId: stepUpChallengeId,
                        userId: user.id,
                        mPinPlain: mpin,
                    })
                    if (!verify.ok) return null
                    return finalizeCredentialLogin({
                        user,
                        request,
                        sessionAuth: null,
                        action: "login",
                        skipNetworkEval: true,
                    })
                }

                // Handle legacy email login
                if (credentials.email) {
                    const validatedFields = signInSchema.safeParse(credentials)

                    if (!validatedFields.success) {
                        return null
                    }

                    const { email, password } = validatedFields.data

                    const user = await prisma.user.findUnique({
                        where: { email: canonicalEmailForPersistence(email) },
                    })

                    if (!user || !user.password) {
                        return null
                    }

                    const passwordsMatch = await bcrypt.compare(password, user.password)

                    if (!passwordsMatch) {
                        return null
                    }

                    return finalize(user, null)
                }

                // Handle mobile/clientId login
                if (credentials.identifier) {
                    const validatedFields = mobileSignInSchema.safeParse(credentials)

                    if (!validatedFields.success) {
                        return null
                    }

                    const { identifier, password } = validatedFields.data

                    const user = await getUserByIdentifier(identifier)

                    if (!user || !user.password) {
                        return null
                    }

                    const passwordsMatch = await bcrypt.compare(password, user.password)

                    if (!passwordsMatch) {
                        return null
                    }

                    return finalize(user, null)
                }

                // Handle mobile authentication with session token
                if (credentials.sessionToken) {
                    const sessionAuth = await prisma.sessionAuth.findUnique({
                        where: { sessionToken: credentials.sessionToken },
                        include: { user: true }
                    })

                    if (!sessionAuth || sessionAuth.expiresAt < new Date()) {
                        return null
                    }

                    // Verify mPin if required
                    if (sessionAuth.isMpinVerified) {
                        return finalize(sessionAuth.user, sessionAuth)
                    }

                    return null
                }

                return null
            },
        }),
    ],
    session: {
        strategy: "jwt",
        maxAge: 30 * 24 * 60 * 60,
    },
    pages: {
        signIn: getAuthRoute("login"),
        error: `${getAuthRoute("root")}/error`,
    },
    events: {
        async linkAccount({ user }) {
            await prisma.user.update({
                where: { id: user.id },
                data: { emailVerified: new Date() }
            })
        },
        async signOut(message) {
            if ("token" in message && message.token && typeof message.token === "object") {
                const reg = (message.token as { sessionRegistryJti?: string }).sessionRegistryJti
                if (reg) await revokeJti(reg)
            }
        }
    },
    callbacks: {
        async session({ session, token }) {
            if ((token as any).invalidSession) {
                authSessionDebug("session:strip_user", { reason: "invalidSession" })
                session.user = undefined as any
                authSessionDebug("session:outcome", {
                    stripped: true,
                    hasUser: false,
                    uidPrefix: undefined,
                    stepUpPending: false,
                })
                return session
            }
            if (token) {
                session.user = session.user || {}; // Ensure `user` object is initialized
                const t = token as any
                const resolvedId =
                  typeof t.id === "string" && t.id.trim() !== ""
                    ? t.id
                    : typeof t.sub === "string"
                      ? t.sub
                      : undefined
                if (!resolvedId) {
                    authSessionDebug("session:no_resolved_id", {
                        hasId: typeof t.id === "string",
                        hasSub: typeof t.sub === "string",
                    })
                }
                session.user.id = resolvedId as string;
                session.user.name = token.name;
                session.user.email = token.email;
                // Auth.js default maps session.user.image from token.picture
                session.user.image = (token as { picture?: string | null }).picture ?? null;
                // Expose custom fields to the client session for gating and data access
                const anySessionUser = session.user as any;
                const anyToken = token as any;
                anySessionUser.kycStatus = anyToken.kycStatus as string | undefined;
                anySessionUser.tradingAccountId = anyToken.tradingAccountId as string | undefined;
                anySessionUser.demoTradingAccountId = anyToken.demoTradingAccountId as string | undefined;
                anySessionUser.accountType = (anyToken.accountType as "LIVE" | "DEMO" | undefined);
                anySessionUser.phone = anyToken.phone as string | undefined;
                anySessionUser.clientId = anyToken.clientId as string | undefined;
                anySessionUser.hasMpin = anyToken.hasMpin as boolean | undefined;
                anySessionUser.phoneVerified = anyToken.phoneVerified as boolean | undefined;
                anySessionUser.role = anyToken.role as string | undefined;
                anySessionUser.sessionSecurityStepUpPending = Boolean(anyToken.sessionSecurityStepUpPending);
                anySessionUser.sessionSecurityStepUpChallengeId = anyToken.sessionSecurityStepUpChallengeId as
                  | string
                  | undefined;
                authSessionDebug("session:outcome", {
                    stripped: false,
                    hasUser: typeof resolvedId === "string" && resolvedId.trim().length > 0,
                    uidPrefix: prefixId(resolvedId),
                    stepUpPending: Boolean(anyToken.sessionSecurityStepUpPending),
                })
            }
            return session;
        },
        async jwt({ token, user, account, trigger }) {
            const anyTok = token as any
            if (!anyTok.id && typeof anyTok.sub === "string" && anyTok.sub.trim() !== "") {
                anyTok.id = anyTok.sub
            }
            delete anyTok.jti
            authSessionDebug("jwt:start", {
                trigger: trigger ?? null,
                hasUser: !!user,
                uidPrefix: prefixId(anyTok.id),
                jtiPrefix: prefixId(anyTok.sessionRegistryJti),
                authVia: anyTok.authVia ?? null,
                invalidIn: !!anyTok.invalidSession,
            })
            // When user signs in (credentials)
            if (user) {
                token.id = user.id
                token.name = user.name
                token.email = user.email
                token.phone = user.phone
                token.clientId = user.clientId
                token.role = user.role
                ;(token as { picture?: string | null }).picture =
                    (user as { image?: string | null }).image ?? undefined
                const u = user as FinalizedCredentialUser
                if (u.sessionSecurityStepUpPending && u.sessionSecurityStepUpChallengeId) {
                    (token as any).sessionSecurityStepUpPending = true
                    ;(token as any).sessionSecurityStepUpChallengeId = u.sessionSecurityStepUpChallengeId
                    delete (token as any).sessionRegistryJti
                } else {
                    delete (token as any).sessionSecurityStepUpPending
                    delete (token as any).sessionSecurityStepUpChallengeId
                    if (u.sessionRegistryJti) {
                        (token as any).sessionRegistryJti = u.sessionRegistryJti
                    } else {
                        delete (token as any).sessionRegistryJti
                    }
                }
                if (account?.provider === "credentials") {
                    (token as any).authVia = "credentials"
                } else if (account?.provider) {
                    (token as any).authVia = account.provider
                }
                delete (token as any).invalidSession
            }

            if (trigger === "update" && token.id) {
                try {
                    const row = await prisma.user.findUnique({
                        where: { id: token.id as string },
                        select: { image: true },
                    })
                    ;(token as { picture?: string | null }).picture = row?.image ?? undefined
                } catch {
                    /* keep token picture */
                }
            }

            // Apply auth.update() stamp — session layer set demoTradingAccountId / accountType
            // These are set directly on the token so they survive without a DB re-query
            if (anyTok._pendingUpdate) {
                if (anyTok._pendingUpdate.demoTradingAccountId !== undefined) {
                    anyTok.demoTradingAccountId = anyTok._pendingUpdate.demoTradingAccountId
                }
                if (anyTok._pendingUpdate.accountType !== undefined) {
                    anyTok.accountType = anyTok._pendingUpdate.accountType
                }
                delete anyTok._pendingUpdate
            }

            // Also read from cookie set by /api/account/demo for cross-request state
            try {
                const { cookies } = await import("next/headers")
                const cookieStore = await cookies()
                const pending = cookieStore.get("demoAccountPending")?.value
                if (pending) {
                    const data = JSON.parse(pending)
                    if (data.demoTradingAccountId) anyTok.demoTradingAccountId = data.demoTradingAccountId
                    if (data.accountType) anyTok.accountType = data.accountType
                }
            } catch {
                /* cookie read optional */
            }

            const USER_CLAIMS_TTL_MS = 5 * 60 * 1000
            const claimsAt = typeof anyTok.userClaimsAt === "number" ? anyTok.userClaimsAt : 0
            const shouldRefreshUserClaims =
                !!user || !claimsAt || Date.now() - claimsAt > USER_CLAIMS_TTL_MS
            if (token.id && shouldRefreshUserClaims) {
                try {
                    const dbUser = await prisma.user.findUnique({
                        where: { id: token.id as string },
                        include: { kyc: true, tradingAccount: true },
                    })
                    const anyToken = token as any
                    anyToken.kycStatus = dbUser?.kyc?.status ?? undefined
                    anyToken.tradingAccountId = dbUser?.tradingAccount?.id ?? undefined
                    // Demo account lookup — separate query since tradingAccount relation returns LIVE only
                    try {
                        const demoAccount = await prisma.tradingAccount.findFirst({
                            where: { userId: token.id as string, accountType: "DEMO" },
                            select: { id: true },
                        })
                        anyToken.demoTradingAccountId = demoAccount?.id ?? undefined
                    } catch {
                        anyToken.demoTradingAccountId = undefined
                    }
                    anyToken.hasMpin = !!dbUser?.mPin
                    anyToken.phoneVerified = !!dbUser?.phoneVerified
                    anyToken.role = dbUser?.role ?? undefined
                    anyToken.picture = dbUser?.image ?? undefined
                    anyToken.userClaimsAt = Date.now()
                    let accountBlocked = false
                    if (!dbUser) {
                        accountBlocked = true
                    } else {
                        const acc = resolveAccountAccess({
                            isActive: dbUser.isActive,
                            suspendedAt: dbUser.suspendedAt,
                        })
                        accountBlocked = acc.state !== "ok"
                    }
                    anyToken.accountBlocked = accountBlocked
                } catch (e) {
                    // noop: if prisma fails, keep token as-is
                }
            }

            const OAUTH_PROVIDERS = new Set(["google", "apple", "github"])
            let registryJti = (token as any).sessionRegistryJti as string | undefined
            const uid = token.id as string | undefined
            const authVia = (token as any).authVia as string | undefined
            const skipRegistry = authVia != null && OAUTH_PROVIDERS.has(authVia)
            const stepUpPending = Boolean((token as any).sessionSecurityStepUpPending)
            if (skipRegistry) {
                authSessionDebug("jwt:skip_registry", { authVia })
            }
            if (stepUpPending) {
                authSessionDebug("jwt:step_up_pending", { uidPrefix: prefixId(uid) })
            }
            if (!skipRegistry && uid && !stepUpPending && !registryJti) {
                const minted = await mintLegacyCredentialJtiIfPolicyEnabled(uid)
                if (minted) {
                    (token as any).sessionRegistryJti = minted
                    registryJti = minted
                    if (!(token as any).accountBlocked) {
                        delete (token as any).invalidSession
                    }
                    authSessionDebug("jwt:legacy_jti_minted", { jtiPrefix: prefixId(minted) })
                }
            }
            if (!skipRegistry && uid && !stepUpPending) {
                const jtiVerifyOpts = {
                    lastDbVerifyMs:
                        typeof anyTok.jtiDbVerifiedAt === "number" ? anyTok.jtiDbVerifiedAt : undefined,
                }
                let jtiEval = await evaluateJtiSession(registryJti, uid, jtiVerifyOpts)
                authSessionDebug("jwt:jti_eval", {
                    attempt: 1,
                    valid: jtiEval.valid,
                    reason: jtiEval.reason,
                    jtiPrefix: prefixId(registryJti),
                    uidPrefix: prefixId(uid),
                })
                let valid = jtiEval.valid
                // Retry ONLY for row_not_found — the legitimate read-replica race where a
                // freshly minted JTI hasn't propagated. All other invalid reasons (revoked,
                // expired_row, user_mismatch, idle_ttl_exceeded) are deterministic and must
                // fail fast — paying 120 ms for them on every request was the JWT hot-path
                // perf bug we removed in Wave 1.
                if (!valid && registryJti && uid && jtiEval.reason === "row_not_found") {
                    await new Promise((r) => setTimeout(r, 120))
                    jtiEval = await evaluateJtiSession(registryJti, uid, jtiVerifyOpts)
                    valid = jtiEval.valid
                    authSessionDebug("jwt:jti_eval", {
                        attempt: 2,
                        valid: jtiEval.valid,
                        reason: jtiEval.reason,
                        jtiPrefix: prefixId(registryJti),
                        uidPrefix: prefixId(uid),
                    })
                }
                if (!valid) {
                    (token as any).invalidSession = true
                    authSessionDebug("jwt:invalid_session_set", { reason: jtiEval.reason })
                } else if (registryJti) {
                    if (!(token as any).accountBlocked) {
                        delete (token as any).invalidSession
                    }
                    if (jtiEval.reason !== "ok_cache") {
                        await touchSessionByJti(registryJti, 5 * 60 * 1000)
                    }
                    if (jtiEval.reason !== "ok_cache") {
                        anyTok.jtiDbVerifiedAt = Date.now()
                    }
                }
            }

            if ((token as any).accountBlocked) {
                (token as any).invalidSession = true
            }

            delete (token as any).jti
            authSessionDebug("jwt:end", {
                invalidOut: !!(token as any).invalidSession,
                jtiPrefix: prefixId((token as any).sessionRegistryJti),
                uidPrefix: prefixId(token.id as string | undefined),
            })
            return token
        }
    },
    secret: process.env.NEXTAUTH_SECRET,
}

// Export NextAuth instance with configuration
export const { handlers, signIn, signOut, auth } = NextAuth(authOptions)
