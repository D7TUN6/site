import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js'
import type { Lang } from '@/types/content'
import { getSession } from '@/lib/api/auth'
import { fetchComments, submitComment, countComments, type BlogComment } from '@/lib/api/comments'

function __l(lang: string, en: string, ru: string): string { return lang === 'ru' ? ru : en }

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function renderCommentText(content: string): string {
  const html = escapeHtml(content)
    .split('\n')
    .map((line) => {
      const quoted = line.match(/^&gt;\s?(.*)$/)
      if (quoted) return `<span class="comment-quote">> ${quoted[1]}</span>`
      const pings = line.replace(/@([a-zA-Z0-9_.-]+)/g, '<span class="comment-ping">@$1</span>')
      return pings
    })
    .join('<br />')
  return html
}

function addCommentToTree(comments: BlogComment[], comment: BlogComment): BlogComment[] {
  if (comment.parentId === null) return [...comments, comment]
  const walk = (nodes: BlogComment[]): BlogComment[] =>
    nodes.map((n) => {
      if (n.id === comment.parentId) return { ...n, replies: [...n.replies, comment] }
      if (n.replies.length) return { ...n, replies: walk(n.replies) }
      return n
    })
  return walk(comments)
}

export function CommentsSection(props: { lang: Lang; slug: string }) {
  const postKey = createMemo(() => `${props.lang}:${props.slug}`)
  const [comments, setComments] = createSignal<BlogComment[]>([])
  const [loading, setLoading] = createSignal(true)
  const [loadedOnce, setLoadedOnce] = createSignal(false)
  const [user, setUser] = createSignal<{ id: number; email: string; role: string } | null>(null)
  const [draft, setDraft] = createSignal('')
  const [replyTo, setReplyTo] = createSignal<BlogComment | null>(null)
  const [submitting, setSubmitting] = createSignal(false)
  const [error, setError] = createSignal('')
  const [notice, setNotice] = createSignal('')

  createEffect(() => {
    const key = postKey()
    const lang = props.lang
    if (!key || loadedOnce()) return
    let cancelled = false
    setLoading(true)
    setNotice('')
    void getSession().then((s) => { if (!cancelled) setUser(s?.user ?? null) }).catch(() => { if (!cancelled) setUser(null) })
    void fetchComments(key)
      .then((res) => { if (!cancelled) setComments(res.comments ?? []) })
      .catch(() => { if (!cancelled) setError(__l(lang, 'Failed to load comments', 'Не удалось загрузить комментарии')) })
      .finally(() => { if (!cancelled) { setLoading(false); setLoadedOnce(true) } })
    onCleanup(() => { cancelled = true })
  })

  const totalCount = createMemo(() => countComments(comments()))

  const handleSubmit = async () => {
    const content = draft().trim()
    if (!content || submitting()) return
    setSubmitting(true)
    setError('')
    setNotice('')
    try {
      const res = await submitComment({ postSlug: postKey(), parentId: replyTo()?.id ?? null, content })
      const created = res.comment
      if (created.status === 'pending') {
        setNotice(__l(props.lang, 'Your comment is queued for moderation.', 'Комментарий отправлен на модерацию.'))
      }
      const current = [...comments()]
      setComments(addCommentToTree(current, {
        id: created.id,
        parentId: created.parentId,
        authorName: created.authorName,
        content: created.content,
        createdAt: created.createdAt,
        replies: [],
      }))
      setDraft('')
      setReplyTo(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : __l(props.lang, 'Failed to post comment', 'Не удалось отправить комментарий'))
    } finally {
      setSubmitting(false)
    }
  }

  const startReply = (c: BlogComment) => {
    setReplyTo(c)
    setDraft(`@${c.authorName} `)
    setError('')
    document.getElementById('comment-input')?.focus()
  }

  const startQuote = (c: BlogComment) => {
    const selection = window.getSelection()?.toString()?.trim()
    const text = selection || c.content
    const quoted = text
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n')
    setDraft((prev) => (prev ? `${prev.trimEnd()}\n\n${quoted}\n\n` : `${quoted}\n\n`))
    setError('')
    document.getElementById('comment-input')?.focus()
  }

  const CommentItem = (cprops: { comment: BlogComment; depth: number }) => (
    <div class="comment-node">
      <div class="comment-item">
        <div class="comment-item-head">
          <span class="comment-author">@{cprops.comment.authorName}</span>
          <span class="comment-date">{new Date(cprops.comment.createdAt).toLocaleDateString()}</span>
        </div>
        <div class="comment-body" innerHTML={renderCommentText(cprops.comment.content)} />
        <div class="comment-actions">
          <button type="button" class="comment-action" onClick={() => startReply(cprops.comment)}>[{__l(props.lang, 'reply', 'ответить')}]</button>
          <button type="button" class="comment-action" onClick={() => startQuote(cprops.comment)}>[{__l(props.lang, 'quote', 'цитата')}]</button>
        </div>
      </div>
      <Show when={cprops.comment.replies.length > 0}>
        <div class="comment-replies">
          <For each={cprops.comment.replies}>{(reply) => <CommentItem comment={reply} depth={cprops.depth + 1} />}</For>
        </div>
      </Show>
    </div>
  )

  return (
    <section class="comments" id="comments">
      <div class="comments-head">
        <h2>[{__l(props.lang, 'comments', 'комментарии')}] <span class="comments-count">{totalCount()}</span></h2>
      </div>

      <Show when={!user()} fallback={(
        <div class="comment-form-wrap">
          <Show when={replyTo()}>
            <div class="comment-reply-to">
              {__l(props.lang, 'replying to:', 'ответ на:')} <strong>@{replyTo()!.authorName}</strong>
              <button type="button" class="comment-action" onClick={() => { setReplyTo(null); setDraft('') }}>[{__l(props.lang, 'cancel', 'отмена')}]</button>
            </div>
          </Show>
          <textarea
            id="comment-input"
            class="comment-input"
            rows={4}
            maxLength={2000}
            placeholder={__l(props.lang, 'write in your terminal...', 'пишите как в терминале...')}
            value={draft()}
            onInput={(e) => setDraft(e.currentTarget.value)}
          />
          <Show when={draft().length > 1950}>
            <div class="comment-hint">{2000 - draft().length} {__l(props.lang, 'chars left', 'символов осталось')}</div>
          </Show>
          <div class="comment-form-actions">
            <button type="button" class="shop-btn" disabled={!draft().trim() || submitting()} onClick={() => void handleSubmit()}>
              {submitting() ? '...' : __l(props.lang, 'POST COMMENT', 'ОТПРАВИТЬ')}
            </button>
          </div>
        </div>
      )}>
        <div class="comments-auth-note">
          {__l(props.lang, 'sign in to join the discussion', 'войдите, чтобы оставить комментарий')}&nbsp;
          → <a class="content-link-plain" href={`/${props.lang}/account`}>{__l(props.lang, 'go to account', 'в аккаунт')}</a>
        </div>
      </Show>

      <Show when={notice()}><p class="comment-notice">{notice()}</p></Show>
      <Show when={error()}><p class="comment-error">[!] {error()}</p></Show>

      <div class="comments-list">
        <Show when={!loading()} fallback={<div class="comment-hint">{__l(props.lang, 'loading...', 'загрузка...')}</div>}>
          <For each={comments()}>
            {(comment) => <CommentItem comment={comment} depth={0} />}
          </For>
          <Show when={comments().length === 0}>
            <div class="comment-empty">{__l(props.lang, 'no comments yet — be the first (lurker)', 'пока нет комментариев — станьте первым')}</div>
          </Show>
        </Show>
      </div>
    </section>
  )
}