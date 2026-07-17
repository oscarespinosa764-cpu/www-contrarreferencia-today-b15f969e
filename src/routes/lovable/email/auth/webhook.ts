import * as React from 'react'
import { render } from '@react-email/render'
import { parseEmailWebhookPayload } from '@lovable.dev/email-js'
import { WebhookError, verifyWebhookRequest } from '@lovable.dev/webhooks-js'
import { createClient } from '@supabase/supabase-js'
import { createFileRoute } from '@tanstack/react-router'
import { SignupEmail } from '@/lib/email-templates/signup'
import { InviteEmail } from '@/lib/email-templates/invite'
import { MagicLinkEmail } from '@/lib/email-templates/magic-link'
import { RecoveryEmail } from '@/lib/email-templates/recovery'
import { EmailChangeEmail } from '@/lib/email-templates/email-change'
import { ReauthenticationEmail } from '@/lib/email-templates/reauthentication'

const EMAIL_SUBJECTS: Record<string, string> = {
  signup: 'CONFIRMACIÓN DE CORREO — CEDIM IPS',
  invite: 'ACTIVACIÓN DE USUARIO — CEDIM IPS',
  magiclink: 'ENLACE DE ACCESO — CEDIM IPS',
  recovery: 'RESTABLECIMIENTO DE CONTRASEÑA — CEDIM IPS',
  email_change: 'CONFIRMACIÓN DE CAMBIO DE CORREO — CEDIM IPS',
  reauthentication: 'CÓDIGO DE VERIFICACIÓN — CEDIM IPS',
}

// Template mapping
const EMAIL_TEMPLATES: Record<string, React.ComponentType<any>> = {
  signup: SignupEmail,
  invite: InviteEmail,
  magiclink: MagicLinkEmail,
  recovery: RecoveryEmail,
  email_change: EmailChangeEmail,
  reauthentication: ReauthenticationEmail,
}

// Configuration
const SITE_NAME = "CEDIM IPS — REFERENCIA Y CONTRARREFERENCIA"
const SENDER_DOMAIN = "notify.contrarreferencia.today"
const ROOT_DOMAIN = "www.contrarreferencia.today"
const FROM_DOMAIN = "notify.contrarreferencia.today"


function redactEmail(email: string | null | undefined): string {
  if (!email) return '***'
  const [localPart, domain] = email.split('@')
  if (!localPart || !domain) return '***'
  return `${localPart[0]}***@${domain}`
}

export const Route = createFileRoute("/lovable/email/auth/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY

        if (!apiKey) {
          console.error('LOVABLE_API_KEY not configured')
          return Response.json(
            { error: 'Server configuration error' },
            { status: 500 }
          )
        }

        // Verify signature + timestamp, then parse payload.
        let payload: any
        let run_id = ''
        try {
          const verified = await verifyWebhookRequest({
            req: request,
            secret: apiKey,
            parser: parseEmailWebhookPayload,
          })
          payload = verified.payload
          run_id = payload.run_id
        } catch (error) {
          if (error instanceof WebhookError) {
            switch (error.code) {
              case 'invalid_signature':
              case 'missing_timestamp':
              case 'invalid_timestamp':
              case 'stale_timestamp':
                console.error('Invalid webhook signature', { error: error.message })
                return Response.json(
                  { error: 'Invalid signature' },
                  { status: 401 }
                )
              case 'invalid_payload':
              case 'invalid_json':
                console.error('Invalid webhook payload', { error: error.message })
                return Response.json(
                  { error: 'Invalid webhook payload' },
                  { status: 400 }
                )
            }
          }

          console.error('Webhook verification failed', { error })
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (!run_id) {
          console.error('Webhook payload missing run_id')
          return Response.json(
            { error: 'Invalid webhook payload' },
            { status: 400 }
          )
        }

        if (payload.version !== '1') {
          console.error('Unsupported payload version', { version: payload.version, run_id })
          return Response.json(
            { error: `Unsupported payload version: ${payload.version}` },
            { status: 400 }
          )
        }

        // The email action type is in payload.data.action_type (e.g., "signup", "recovery")
        // payload.type is the hook event type ("auth")
        const emailType = payload.data.action_type
        console.log('Received auth event', {
          emailType,
          email_redacted: redactEmail(payload.data.email),
          run_id,
        })

        try {
          const EmailTemplate = EMAIL_TEMPLATES[emailType]
          if (!EmailTemplate) {
            console.error('Unknown email type', { emailType, run_id })
            return Response.json(
              { error: `Unknown email type: ${emailType}` },
              { status: 400 }
            )
          }

          // Build template props from payload.data (HookData structure)
          const templateProps = {
            siteName: SITE_NAME,
            siteUrl: `https://${ROOT_DOMAIN}`,
            recipient: payload.data.email,
            confirmationUrl: payload.data.url,
            token: payload.data.token,
            email: payload.data.email,
            oldEmail: payload.data.old_email,
            newEmail: payload.data.new_email,
          }

          // Render React Email to HTML and plain text
          let html: string
          let text: string
          try {
            const element = React.createElement(EmailTemplate, templateProps)
            html = await render(element)
            text = await render(element, { plainText: true })
          } catch (renderError: any) {
            console.error('Auth email render failed', {
              emailType,
              run_id,
              stage: 'render',
              message: renderError?.message ?? String(renderError),
              name: renderError?.name,
            })
            return Response.json(
              { error: 'Render failed' },
              { status: 500 }
            )
          }

          // Enqueue email for async processing by the dispatcher (process-email-queue).
          const supabaseUrl =
            import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
          const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

          if (!supabaseUrl || !supabaseServiceKey) {
            console.error('Missing Supabase environment variables', {
              run_id,
              hasUrl: Boolean(supabaseUrl),
              hasServiceKey: Boolean(supabaseServiceKey),
            })
            return Response.json(
              { error: 'Server configuration error' },
              { status: 500 }
            )
          }

          const supabase = createClient(supabaseUrl, supabaseServiceKey)
          const messageId = crypto.randomUUID()

          // Log pending BEFORE enqueue so we have a record even if enqueue crashes
          const { error: logPendingError } = await supabase
            .from('email_send_log')
            .insert({
              message_id: messageId,
              template_name: emailType,
              recipient_email: payload.data.email,
              status: 'pending',
            })
          if (logPendingError) {
            console.error('Failed to log pending auth email', {
              run_id,
              emailType,
              code: logPendingError.code,
              message: logPendingError.message,
            })
          }

          const { error: enqueueError } = await supabase.rpc('enqueue_email', {
            queue_name: 'auth_emails',
            payload: {
              run_id,
              message_id: messageId,
              to: payload.data.email,
              from: `${SITE_NAME} <noreply@${FROM_DOMAIN}>`,
              sender_domain: SENDER_DOMAIN,
              subject: EMAIL_SUBJECTS[emailType] || 'Notification',
              html,
              text,
              purpose: 'transactional',
              label: emailType,
              queued_at: new Date().toISOString(),
            },
          })

          if (enqueueError) {
            console.error('Failed to enqueue auth email', {
              run_id,
              emailType,
              code: enqueueError.code,
              message: enqueueError.message,
            })
            await supabase.from('email_send_log').insert({
              message_id: messageId,
              template_name: emailType,
              recipient_email: payload.data.email,
              status: 'failed',
              error_message: 'Failed to enqueue email',
            })
            return Response.json(
              { error: 'Failed to enqueue email' },
              { status: 500 }
            )
          }

          console.log('Auth email enqueued', {
            emailType,
            email_redacted: redactEmail(payload.data.email),
            run_id,
          })

          return Response.json({ success: true, queued: true })
        } catch (handlerError: any) {
          console.error('Auth webhook handler crashed', {
            run_id,
            emailType,
            stage: 'handler',
            name: handlerError?.name,
            message: handlerError?.message ?? String(handlerError),
          })
          return Response.json(
            { error: 'Handler error' },
            { status: 500 }
          )
        }

      },
    },
  },
})
