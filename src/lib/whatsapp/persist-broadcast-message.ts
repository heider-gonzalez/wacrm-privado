import type { SupabaseClient } from '@supabase/supabase-js'

import { findExistingContact, isUniqueViolation } from '@/lib/contacts/dedupe'

/**
 * Substitute {{1}}, {{2}}, … body placeholders with the resolved
 * per-recipient values. Mirrors the client-side renderer used by the
 * inbox template composer so the persisted message matches what the
 * recipient actually saw.
 */
function renderTemplateBody(body: string, params: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_, raw) => {
    const idx = Number(raw) - 1
    return params[idx] ?? `{{${raw}}}`
  })
}

/**
 * After a broadcast template is successfully sent to Meta, persist the
 * outbound message in the `messages` table so it appears in the inbox
 * conversation history alongside replies.
 *
 * `bodyText` + `bodyParams` (optional) let the caller persist the
 * rendered template body — without them the message is stored with a
 * null `content_text` and the inbox renders an empty template bubble.
 *
 * Best-effort: a missing contact or DB error is logged but never throws
 * — the broadcast already succeeded at the Meta level, and failing here
 * would incorrectly mark the recipient as failed.
 */
export async function persistBroadcastMessage(
  db: SupabaseClient,
  accountId: string,
  ownerUserId: string,
  phone: string,
  templateName: string,
  metaMessageId: string,
  bodyText?: string | null,
  bodyParams?: string[],
): Promise<void> {
  try {
    const contact = await findExistingContact(db, accountId, phone)
    if (!contact) return

    const conversationId = await findOrCreateConversation(
      db,
      accountId,
      contact.id,
      ownerUserId,
    )

    const contentText = bodyText
      ? renderTemplateBody(bodyText, bodyParams ?? [])
      : null

    await db.from('messages').insert({
      conversation_id: conversationId,
      sender_type: 'bot',
      content_type: 'template',
      content_text: contentText,
      template_name: templateName,
      message_id: metaMessageId,
      status: 'sent',
    })

    await db
      .from('conversations')
      .update({
        last_message_text: contentText ?? `[template:${templateName}]`,
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', conversationId)
  } catch (err) {
    console.error(
      '[persist-broadcast-message] error:',
      err instanceof Error ? err.message : err,
    )
  }
}

async function findOrCreateConversation(
  db: SupabaseClient,
  accountId: string,
  contactId: string,
  ownerUserId: string,
): Promise<string> {
  const { data: existing } = await db
    .from('conversations')
    .select('id')
    .eq('account_id', accountId)
    .eq('contact_id', contactId)
    .order('created_at', { ascending: true })
    .limit(1)

  if (existing && existing.length > 0) {
    return existing[0].id
  }

  const { data: created, error: createErr } = await db
    .from('conversations')
    .insert({
      account_id: accountId,
      user_id: ownerUserId,
      contact_id: contactId,
    })
    .select('id')
    .single()

  if (createErr || !created) {
    if (isUniqueViolation(createErr)) {
      const { data: raced } = await db
        .from('conversations')
        .select('id')
        .eq('account_id', accountId)
        .eq('contact_id', contactId)
        .order('created_at', { ascending: true })
        .limit(1)
      if (raced && raced.length > 0) {
        return raced[0].id
      }
    }
    throw createErr || new Error('Failed to create conversation')
  }

  return created.id
}
