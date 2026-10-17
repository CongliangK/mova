import { Clock3, MessageSquare, Plus, Trash2 } from "lucide-react"
import { useChatStore } from "../../stores/chat-store"

interface ChatHistoryPanelProps {
  onSelectConversation?: () => void
}

export function ChatHistoryPanel({ onSelectConversation }: ChatHistoryPanelProps) {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeConversationId)
  const createConversation = useChatStore((s) => s.createConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-panel)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-5">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">AI History</h2>
          <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
            Project conversations
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            createConversation()
            onSelectConversation?.()
          }}
          className="mova-icon-button"
          title="New chat"
          aria-label="New chat"
        >
          <Plus size={17} />
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {conversations.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <Clock3 size={22} className="text-[var(--color-text-muted)]" />
            <p className="mt-3 text-sm font-semibold text-[var(--color-text-primary)]">No history yet</p>
            <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
              New conversations will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conversation) => (
              <div
                key={conversation.id}
                className={`group flex cursor-pointer items-center gap-3 rounded-[var(--radius-lg)] px-3 py-2.5 transition-colors ${
                  conversation.id === activeId
                    ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                }`}
                onClick={() => {
                  setActiveConversation(conversation.id)
                  onSelectConversation?.()
                }}
              >
                <MessageSquare size={15} className="shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{conversation.title}</div>
                  <div className="mt-0.5 text-[10px] opacity-70">
                    {conversation.messages.length} message{conversation.messages.length === 1 ? "" : "s"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation()
                    deleteConversation(conversation.id)
                  }}
                  className="shrink-0 rounded p-1 opacity-0 hover:text-[var(--color-danger)] group-hover:opacity-100"
                  title="Delete conversation"
                  aria-label="Delete conversation"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
