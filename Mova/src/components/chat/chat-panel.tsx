import { memo, useState, useRef, useEffect, useCallback, useMemo } from "react"
import {
  AlertCircle,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  History,
  Loader2,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  SendHorizonal,
  Square,
  Trash2,
  Wand2,
} from "lucide-react"
import ReactMarkdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useChatStore, useActiveMessages } from "../../stores/chat-store"
import { useProjectStore } from "../../stores/project-store"
import { useAgent } from "../../hooks/use-agent"
import { skillRegistry } from "../../services/ai/skills/skill-registry"
import type { Skill, ToolCallResult, WorkbenchStepStatus } from "../../types/ai"
import { readFileDragPayload } from "../../utils/file-drag"
import { LocalImage } from "../ui/local-image"
import { ToolCallCard } from "./tool-call-card"

const SKILL_EXAMPLES: Record<string, string[]> = {
  "character-creation": [
    "Create a pixel art knight character",
    "Design a cute mage with a staff",
    "Make a cyberpunk warrior with neon accents",
  ],
  general: [
    "What animations do I need for a platformer?",
    "Plan a walk cycle for my character",
    "How do I export a sprite sheet?",
  ],
  "sprite-generation": [
    "Generate a 4x4 walk sprite sheet for my knight",
    "Create a 2x2 idle animation with magenta background",
    "Make a 1x4 projectile sprite sheet",
  ],
  "map-generation": [
    "Create a top-down forest village base map",
    "Design a top-down dungeon scene with layered props",
    "Make a top-down market square map foundation",
  ],
}

const DEFAULT_EXAMPLES = [
  "Create a pixel art knight character",
  "Design a walk animation for my character",
  "What animations do I need for a platformer?",
]

const VISIBLE_MESSAGE_LIMIT = 80

interface WorkbenchStep {
  label: string
  detail: string
  status: WorkbenchStepStatus
}

function getToolCalls(
  messages: ReturnType<typeof useActiveMessages>,
): ToolCallResult[] {
  return messages.flatMap((message) => message.toolCalls ?? [])
}

function hasFailedTool(toolCalls: ToolCallResult[], names: string[]) {
  return toolCalls.some(
    (toolCall) =>
      names.includes(toolCall.name) && toolCall.result?.success === false,
  )
}

function hasSuccessfulTool(toolCalls: ToolCallResult[], names: string[]) {
  return toolCalls.some(
    (toolCall) =>
      names.includes(toolCall.name) && toolCall.result?.success === true,
  )
}

function toProjectRelativePath(path: string, projectPath: string | null) {
  if (!projectPath) return path
  const prefix = projectPath.endsWith("/") ? projectPath : `${projectPath}/`
  return path.startsWith(prefix) ? path.slice(prefix.length) : path
}

function appendDroppedPaths(current: string, paths: string[]) {
  const text = paths.filter(Boolean).join("\n")
  if (!text) return current
  return current ? `${current}\n${text}` : text
}

function getDroppedBrowserImageNames(dataTransfer: DataTransfer) {
  return Array.from(dataTransfer.files)
    .filter((file) => file.type.startsWith("image/"))
    .map((file) => file.name)
}

function getStepIcon(status: WorkbenchStepStatus) {
  if (status === "completed")
    return <CheckCircle2 size={16} className="text-[var(--color-success)]" />
  if (status === "error")
    return <AlertCircle size={16} className="text-[var(--color-danger)]" />
  if (status === "running")
    return (
      <Loader2 size={16} className="animate-spin text-[var(--color-accent)]" />
    )
  return <Clock3 size={16} className="text-[var(--color-text-muted)]" />
}

const ChatMessageContent = memo(function ChatMessageContent({ content }: { content: string }) {
  return (
    <div className="min-w-0 max-w-full select-text text-sm leading-6 [overflow-wrap:anywhere]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium underline decoration-current/30 underline-offset-2"
            >
              {children}
            </a>
          ),
          img: ({ alt, src }) => (
            <LocalImage
              src={src}
              alt={alt ?? ""}
              className="my-2 max-h-48 max-w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] object-contain"
              style={{ imageRendering: "pixelated" }}
            />
          ),
          pre: ({ children }) => (
            <pre className="my-2 max-w-full overflow-x-auto rounded-[var(--radius-md)] bg-[var(--color-bg-secondary)] p-3 text-xs leading-5">
              {children}
            </pre>
          ),
          code: ({ children }) => (
            <code className="rounded bg-[var(--color-bg-secondary)] px-1 py-0.5 text-xs">
              {children}
            </code>
          ),
          table: ({ children }) => (
            <div className="my-2 max-w-full overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-xs">
                {children}
              </table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-[var(--color-border)] px-2 py-1 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-[var(--color-border)] px-2 py-1 align-top">
              {children}
            </td>
          ),
          p: ({ children }) => (
            <p className="my-1 whitespace-pre-wrap">{children}</p>
          ),
        }}
      >
        {content || "..."}
      </ReactMarkdown>
    </div>
  )
})

export function ChatPanel() {
  const conversations = useChatStore((s) => s.conversations)
  const activeId = useChatStore((s) => s.activeConversationId)
  const isLoading = useChatStore((s) => s.isLoading)
  const createConversation = useChatStore((s) => s.createConversation)
  const deleteConversation = useChatStore((s) => s.deleteConversation)
  const setActiveConversation = useChatStore((s) => s.setActiveConversation)
  const messages = useActiveMessages()
  const projectPath = useProjectStore((s) => s.projectPath)
  const { sendMessage, abort } = useAgent()

  const [input, setInput] = useState("")
  const [isDragOver, setIsDragOver] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [showAllMessages, setShowAllMessages] = useState(false)
  const [showSkillDropdown, setShowSkillDropdown] = useState(false)
  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null)
  const [activeSkill, setActiveSkill] = useState<Skill | null>(
    skillRegistry.getActiveSkill(),
  )
  const [availableSkills, setAvailableSkills] = useState<Skill[]>(
    skillRegistry.getAvailableSkills(),
  )
  const messageListRef = useRef<HTMLDivElement>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const skillDropdownRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const refreshSkills = useCallback(() => {
    setAvailableSkills(skillRegistry.getAvailableSkills())
    setActiveSkill(skillRegistry.getActiveSkill())
  }, [])

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        skillDropdownRef.current &&
        !skillDropdownRef.current.contains(event.target as Node)
      ) {
        setShowSkillDropdown(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  const handleSkillSelect = (skillName: string | null) => {
    skillRegistry.setActiveSkill(skillName)
    setActiveSkill(skillRegistry.getActiveSkill())
    setShowSkillDropdown(false)
  }

  const getSkillDisplayName = (skill: Skill | null): string => {
    if (!skill) return "Auto"
    return skill.name
      .split("-")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ")
  }

  const getActiveSkillDescription = (): string => {
    if (!activeSkill)
      return "AI will automatically detect the best skill for your request."
    return activeSkill.description
  }

  const examplePrompts = useMemo(() => {
    if (!activeSkill) return DEFAULT_EXAMPLES
    return SKILL_EXAMPLES[activeSkill.name] ?? DEFAULT_EXAMPLES
  }, [activeSkill])

  const visibleMessages = useMemo(() => {
    if (showAllMessages || messages.length <= VISIBLE_MESSAGE_LIMIT) return messages
    return messages.slice(-VISIBLE_MESSAGE_LIMIT)
  }, [messages, showAllMessages])
  const visibleMessageStartIndex = messages.length - visibleMessages.length
  const hiddenMessageCount = visibleMessageStartIndex

  const toolCalls = useMemo(() => getToolCalls(messages), [messages])
  const frameToolNames = [
    "generate_image",
    "generate_sprite_sheet",
    "process_sprite",
    "extract_animation_frames",
  ]
  const previewToolNames = [
    "create_character",
    "extract_animation_frames",
    "compose_preview",
  ]
  const hasMessages = messages.length > 0
  const hasFrameError = hasFailedTool(toolCalls, frameToolNames)
  const hasPreviewError = hasFailedTool(toolCalls, previewToolNames)
  const hasFrameResult = hasSuccessfulTool(toolCalls, frameToolNames)
  const hasPreviewResult = hasSuccessfulTool(toolCalls, previewToolNames)
  const latestUserMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "user")?.content,
    [messages],
  )
  const workflowSteps: WorkbenchStep[] = [
    {
      label: "Select Skill",
      detail: activeSkill ? getSkillDisplayName(activeSkill) : "Auto detection",
      status: activeSkill || hasMessages ? "completed" : "queued",
    },
    {
      label: "Generate Frames",
      detail: hasFrameError
        ? "Generation failed"
        : isLoading
          ? "Generating assets..."
          : hasFrameResult
            ? "Frames generated"
            : "Waiting for prompt",
      status: hasFrameError
        ? "error"
        : hasFrameResult
          ? "completed"
          : isLoading && hasMessages
            ? "running"
            : "queued",
    },
    {
      label: "Preview on Canvas",
      detail: hasPreviewError
        ? "Preview failed"
        : hasPreviewResult
          ? "Ready on canvas"
          : hasFrameResult
            ? "Preparing preview"
            : "Queued",
      status: hasPreviewError
        ? "error"
        : hasPreviewResult
          ? "completed"
          : hasFrameResult && isLoading
            ? "running"
            : "queued",
    },
    {
      label: "Export Sprite Sheet",
      detail: hasPreviewResult ? "Ready to export" : "Queued",
      status: hasPreviewResult ? "completed" : "queued",
    },
  ]

  useEffect(() => {
    const messageList = messageListRef.current
    if (!messageList) return

    // Keep auto-scroll scoped to the chat message list. Calling
    // scrollIntoView() on the sentinel can also scroll the document/webview,
    // which shifts the whole Tauri UI upward and reveals blank space below.
    messageList.scrollTop = messageList.scrollHeight
  }, [messages, isLoading])

  const copyMessage = async (content: string, messageId: string) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(content)
      } else {
        const textarea = document.createElement("textarea")
        textarea.value = content
        textarea.style.position = "fixed"
        textarea.style.opacity = "0"
        document.body.appendChild(textarea)
        textarea.select()
        document.execCommand("copy")
        document.body.removeChild(textarea)
      }
      setCopiedMessageId(messageId)
      window.setTimeout(() => setCopiedMessageId(null), 1200)
    } catch (err) {
      console.warn("Failed to copy chat message", err)
    }
  }

  const editMessage = (content: string) => {
    setInput(content)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const regenerateFrom = (messageIndex: number) => {
    if (isLoading) return
    const userMessage = [...messages]
      .slice(0, messageIndex)
      .reverse()
      .find((message) => message.role === "user")
    const text = userMessage?.content.trim()
    if (text) sendMessage(text)
  }

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput("")
    sendMessage(text)
  }

  return (
    <div className="flex h-full flex-col bg-[var(--color-bg-panel)]">
      <div className="flex shrink-0 items-center justify-between border-b border-[var(--color-border)] px-5 py-5">
        <div>
          <h3 className="text-lg font-semibold text-[var(--color-text-primary)]">
            AI Assistant
          </h3>
          <p className="mt-1 text-xs font-medium text-[var(--color-text-secondary)]">
            {latestUserMessage
              ? "Running animation workflow"
              : "Ready for generation"}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {conversations.length > 1 && (
            <button
              type="button"
              onClick={() => setShowHistory(!showHistory)}
              className={`mova-icon-button ${
                showHistory
                  ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
                  : ""
              }`}
              title="Chat history"
              aria-label="Chat history"
            >
              <History size={17} />
            </button>
          )}
          <button
            type="button"
            onClick={() => createConversation()}
            className="mova-icon-button"
            title="New chat"
            aria-label="New chat"
          >
            <Plus size={17} />
          </button>
          <button
            type="button"
            className="mova-icon-button"
            title="More"
            aria-label="More"
          >
            <MoreHorizontal size={17} />
          </button>
        </div>
      </div>

      {showHistory && (
        <div className="max-h-48 shrink-0 overflow-y-auto border-b border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-3">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              className={`group flex cursor-pointer items-center justify-between rounded-[var(--radius-lg)] px-3 py-2 transition-colors ${
                conv.id === activeId
                  ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
                  : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)]"
              }`}
              onClick={() => {
                setActiveConversation(conv.id)
                setShowHistory(false)
              }}
            >
              <span className="truncate text-xs font-semibold">
                {conv.title}
              </span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  deleteConversation(conv.id)
                }}
                className="ml-2 shrink-0 rounded px-1 text-xs opacity-0 transition-opacity hover:text-[var(--color-danger)] group-hover:opacity-100"
                title="Delete"
                aria-label="Delete"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div ref={messageListRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <div className="mb-5">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-text-secondary)]">
              Current Skill
            </span>
            <div className="relative" ref={skillDropdownRef}>
              <button
                type="button"
                onClick={() => {
                  refreshSkills()
                  setShowSkillDropdown(!showSkillDropdown)
                }}
                disabled={availableSkills.length === 0}
                className="flex items-center gap-2 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] hover:border-[var(--color-border-active)] disabled:cursor-not-allowed disabled:opacity-40"
                title={getActiveSkillDescription()}
              >
                <Wand2 size={14} className="text-[var(--color-accent)]" />
                <span>{getSkillDisplayName(activeSkill)}</span>
                <ChevronDown
                  size={13}
                  className={`transition-transform ${showSkillDropdown ? "rotate-180" : ""}`}
                />
              </button>
              {showSkillDropdown && (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-[220px] rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] py-2 shadow-[var(--shadow-md)]">
                  <button
                    type="button"
                    onClick={() => handleSkillSelect(null)}
                    className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                      activeSkill === null
                        ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
                        : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                    }`}
                  >
                    <div className="font-semibold">Auto</div>
                    <div className="mt-0.5 text-[10px] opacity-75">
                      Detect skill automatically
                    </div>
                  </button>
                  {availableSkills.map((skill) => (
                    <button
                      key={skill.name}
                      type="button"
                      onClick={() => handleSkillSelect(skill.name)}
                      className={`w-full px-3 py-2 text-left text-xs transition-colors ${
                        activeSkill?.name === skill.name
                          ? "bg-[var(--color-brand-red-soft)] text-[var(--color-accent)]"
                          : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
                      }`}
                    >
                      <div className="font-semibold">
                        {getSkillDisplayName(skill)}
                      </div>
                      <div className="mt-0.5 text-[10px] opacity-75">
                        {skill.description}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {latestUserMessage && (
            <div className="mb-5 min-w-0 rounded-[var(--radius-xl)] bg-[var(--color-bg-subtle)] px-4 py-4 text-[var(--color-text-primary)]">
              <ChatMessageContent content={latestUserMessage} />
            </div>
          )}

          <div className="space-y-2">
            {workflowSteps.map((step) => (
              <div
                key={step.label}
                className="flex items-center gap-3 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-4 py-3 shadow-[var(--shadow-xs)]"
              >
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--color-bg-subtle)]">
                  {getStepIcon(step.status)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {step.label}
                  </div>
                  <div className="mt-0.5 truncate text-xs font-medium text-[var(--color-text-secondary)]">
                    {step.detail}
                  </div>
                </div>
                <span
                  className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${
                    step.status === "completed"
                      ? "text-[var(--color-success)]"
                      : step.status === "running"
                        ? "text-[var(--color-accent)]"
                        : step.status === "error"
                          ? "text-[var(--color-danger)]"
                          : "text-[var(--color-text-muted)]"
                  }`}
                >
                  {step.status}
                </span>
              </div>
            ))}
          </div>
        </div>

        {messages.length === 0 ? (
          <div className="space-y-2">
            {examplePrompts.map((example) => (
              <button
                key={example}
                type="button"
                onClick={() => setInput(example)}
                className="w-full rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-bg-panel)] px-4 py-3 text-left text-xs font-semibold leading-5 text-[var(--color-text-primary)] shadow-[var(--shadow-xs)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {example}
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            {hiddenMessageCount > 0 && (
              <button
                type="button"
                onClick={() => setShowAllMessages(true)}
                className="w-full rounded-[var(--radius-lg)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-bg-panel)] px-3 py-2 text-xs font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                Show {hiddenMessageCount} older message{hiddenMessageCount === 1 ? "" : "s"}
              </button>
            )}
            {visibleMessages.map((msg, index) => {
              const messageIndex = visibleMessageStartIndex + index
              const imageToolCall = msg.toolCalls?.find(
                (tc) => tc.name === "generate_image" && tc.result?.success,
              )
              const imagePath = imageToolCall?.result?.data
                ? String(
                    (imageToolCall.result.data as Record<string, unknown>)
                      .imagePath,
                  )
                : undefined

              return (
                <div
                  key={msg.id}
                  className={`group min-w-0 rounded-[var(--radius-xl)] px-4 py-3 shadow-[var(--shadow-xs)] ${
                    msg.role === "user"
                      ? "ml-8 bg-[var(--color-user-bubble)] text-white"
                      : "mr-8 border border-[var(--color-border)] bg-[var(--color-ai-bubble)] text-[var(--color-text-primary)]"
                  }`}
                >
                  <div className="mb-2 flex select-none justify-end gap-1 opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                    <button
                      type="button"
                      onClick={() => copyMessage(msg.content, msg.id)}
                      className="rounded-md border border-white/20 bg-black/10 p-1.5 text-current hover:bg-black/20"
                      title={copiedMessageId === msg.id ? "Copied" : "Copy"}
                      aria-label="Copy message"
                    >
                      <Copy size={13} />
                    </button>
                    {msg.role === "user" ? (
                      <button
                        type="button"
                        onClick={() => editMessage(msg.content)}
                        disabled={isLoading}
                        className="rounded-md border border-white/20 bg-black/10 p-1.5 text-current hover:bg-black/20 disabled:opacity-40"
                        title="Edit"
                        aria-label="Edit message"
                      >
                        <Pencil size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => regenerateFrom(messageIndex)}
                        disabled={isLoading}
                        className="rounded-md border border-white/20 bg-black/10 p-1.5 text-current hover:bg-black/20 disabled:opacity-40"
                        title="Regenerate"
                        aria-label="Regenerate response"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}
                  </div>
                  <ChatMessageContent content={msg.content} />
                  {imagePath && (
                    <div className="mt-3">
                      <LocalImage
                        src={imagePath}
                        alt="Generated character"
                        className="max-h-48 max-w-full rounded-[var(--radius-lg)] border border-[var(--color-border)] object-contain"
                        style={{ imageRendering: "pixelated" }}
                      />
                    </div>
                  )}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {msg.toolCalls.map((tc, i) => (
                        <ToolCallCard key={tc.id || i} toolCall={tc} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}

            {isLoading && messages[messages.length - 1]?.role === "user" && (
              <div className="mr-8 inline-flex items-center gap-2 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-ai-bubble)] px-4 py-3 text-sm text-[var(--color-text-secondary)] shadow-[var(--shadow-xs)]">
                <Loader2 size={16} className="animate-spin" />
                Thinking...
              </div>
            )}
          </div>
        )}

        <div ref={endRef} />
      </div>

      <div className="shrink-0 border-t border-[var(--color-border)] p-5">
        <div
          className={`flex min-h-[116px] flex-col rounded-[var(--radius-xl)] border bg-[var(--color-bg-secondary)] p-3 shadow-[var(--shadow-sm)] transition-colors ${
            isDragOver
              ? "border-[var(--color-accent)]"
              : "border-[var(--color-border)]"
          }`}
          onDragOver={(e) => {
            e.preventDefault()
            e.dataTransfer.dropEffect = "copy"
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            if (e.currentTarget.contains(e.relatedTarget as Node)) return
            setIsDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            const payload = readFileDragPayload(e.dataTransfer)
            const paths = payload
              ? payload.path
                  .split(/\r?\n/)
                  .map((path) => toProjectRelativePath(path, projectPath))
              : getDroppedBrowserImageNames(e.dataTransfer)
            setInput((prev) => appendDroppedPaths(prev, paths))
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                handleSend()
              }
            }}
            disabled={isLoading}
            placeholder={
              isLoading ? "Thinking..." : "Describe the animation..."
            }
            className="min-w-0 flex-1 resize-none bg-transparent px-1 text-sm text-[var(--color-text-primary)] outline-none placeholder:text-[var(--color-text-secondary)] disabled:opacity-50"
          />
          <div className="mt-3 flex justify-end">
            {isLoading ? (
              <button
                type="button"
                onClick={abort}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-text-muted)] text-white shadow-[0_12px_28px_rgba(32,33,36,0.24)] hover:bg-[var(--color-text-secondary)]"
                aria-label="Stop generating"
              >
                <Square size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!input.trim()}
                className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-accent)] text-white shadow-[0_12px_28px_rgba(255,56,48,0.24)] hover:bg-[var(--color-accent-hover)] disabled:opacity-40"
                aria-label="Send message"
              >
                <SendHorizonal size={18} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
