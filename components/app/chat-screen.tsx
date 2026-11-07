"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import {
  AlertTriangle,
  ArrowUp,
  Bell,
  Bug,
  Camera,
  Carrot,
  CircleDot,
  Droplets,
  Eye,
  Info,
  Leaf,
  ListChecks,
  Menu,
  Plus,
  RefreshCw,
  RotateCw,
  Scan,
  Search,
  Settings,
  Sprout,
  Sun,
  Wheat,
  X,
} from "lucide-react";
import { Brand } from "@/components/app/brand";
import { PlantIllustration } from "@/components/app/plant-illustration";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { languages, type Language, setPreferredLanguage } from "@/lib/preferences";
import { t } from "@/lib/i18n";
import { helpfulToOutcome } from "@/lib/follow-up";
import { safeErrorMessage } from "@/lib/errors";
import {
  createConversation,
  getConversations,
  getConversation,
  createMessage,
  deleteMessage,
  uploadCropImage,
  deleteConversation,
  runAssessment,
  recordFollowUp,
  getFollowUpReminders,
} from "@/lib/data/actions";
import { cn } from "@/lib/utils";

export type Message = {
  id: number;
  conversationId: number;
  role: "user" | "assistant";
  content: string;
  language: string;
  status: "pending" | "sent" | "failed";
  createdAt: Date;
  images: Array<{
    id: number;
    cloudinaryPublicId: string;
    secureUrl: string;
  }>;
  assessment?: {
    observedSigns: string[];
    possibleCauses: string[];
    followUpQuestions: string[];
    immediateActions: string[];
    whenToSeekHelp: string;
    uncertainty: {
      level: "low" | "medium" | "high";
      reason: string;
    };
    imageIssues?: {
      total: number;
      failed: number;
    };
  };
};

type Conversation = {
  id: number;
  userId: string;
  title: string;
  crop: string;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * The guided intake prompts shown on an empty chat. Each entry is an i18n key
 * so tapping one composes the farmer's draft in their own language.
 */
const GUIDED_SYMPTOMS = [
  { key: "symptomYellowLeaves", Icon: Sun },
  { key: "symptomDarkSpots", Icon: CircleDot },
  { key: "symptomWilting", Icon: Droplets },
  { key: "symptomHoles", Icon: Scan },
  { key: "symptomInsects", Icon: Bug },
  { key: "symptomLeafCurl", Icon: RotateCw },
  { key: "symptomFruitRot", Icon: Carrot },
] as const;

/**
 * Plant choices. Icons make the choice recognisable without reading, and
 * "plant" keeps the assistant usable when the farmer does not know the name.
 */
const PLANT_OPTIONS = [
  { value: "tomato", labelKey: "plantTomato", Icon: CircleDot },
  { value: "pepper", labelKey: "plantPepper", Icon: Leaf },
  { value: "maize", labelKey: "plantMaize", Icon: Wheat },
  { value: "cassava", labelKey: "plantCassava", Icon: Sprout },
  { value: "yam", labelKey: "plantYam", Icon: Carrot },
  { value: "plant", labelKey: "plantOther", Icon: Scan },
] as const;

/** One compact, icon-led section of an assessment. */
function AssessmentRow({
  icon,
  title,
  tone = "default",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "default" | "warn";
  children: React.ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
          tone === "warn"
            ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
            : "bg-primary/10 text-primary"
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </p>
        <div className="mt-1 space-y-1 text-xs leading-5 text-foreground/85">
          {children}
        </div>
      </div>
    </div>
  );
}

type Reminder = {
  conversationId: number;
  messageId: number;
  title: string;
};

export function ChatScreen({
  initialLanguage,
  conversationId,
  initialConversation,
}: {
  initialLanguage: Language | null | undefined;
  conversationId?: number;
  initialConversation?: Conversation & {
    messages: Message[];
    assessment: Record<string, unknown> | null;
  };
}) {
  const router = useRouter();
  const [language, setLanguage] = useState<Language>(initialLanguage ?? "English");
  const [messages, setMessages] = useState<Message[]>(initialConversation?.messages ?? []);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<number | null>(conversationId ?? null);
  const [draft, setDraft] = useState("");
  const [uploadingFile, setUploadingFile] = useState<File | null>(null);
  const [uploadPreview, setUploadPreview] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedbackStage, setFeedbackStage] = useState<{
    messageId: number;
    helpful: string;
  } | null>(null);
  const [observation, setObservation] = useState("");
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState<number | null>(null);
  const [retryTarget, setRetryTarget] = useState<{
    conversationId: number;
    messageId: number;
  } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(initialConversation ?? null);
  const [plant, setPlant] = useState<string>(initialConversation?.crop ?? "plant");
  const [reminder, setReminder] = useState<Reminder | null>(null);
  const [reminderDismissed, setReminderDismissed] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [messages]);

  useEffect(() => {
    if (uploadPreview) {
      return () => URL.revokeObjectURL(uploadPreview);
    }
  }, [uploadPreview]);

  // Load conversation list on mount
  useEffect(() => {
    loadConversations();
  }, []);

  // Ask the server whether any assessment is old enough to follow up on.
  // Reminders are guidance, not critical path, so a failure is only logged.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const next = await getFollowUpReminders();
        if (!cancelled && next && next.messageId != null) {
          setReminder({
            conversationId: next.conversationId,
            messageId: next.messageId,
            title: next.conversationTitle,
          });
        }
      } catch (err) {
        console.error("Failed to load follow-up reminders:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadConversations() {
    try {
      const list = await getConversations({ limit: 50 });
      setConversations(list);
    } catch (err) {
      console.error("Failed to load conversations:", err);
    }
  }

  async function newChat() {
    setMessages([]);
    setCurrentConversationId(null);
    setActiveConversation(null);
    setDraft("");
    setUploadingFile(null);
    setUploadPreview(null);
    setError(null);
    router.push("/chat");
  }

  async function selectConversation(id: number) {
    try {
      const conversation = await getConversation(id);
      if (!conversation) return;
      setMobileDrawerOpen(false);
      setCurrentConversationId(id);
      setActiveConversation({
        id: conversation.id,
        userId: conversation.userId,
        title: conversation.title,
        crop: conversation.crop,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
      });
      setMessages(conversation.messages as Message[]);
      setPlant(conversation.crop);
      setDraft("");
      setUploadingFile(null);
      setUploadPreview(null);
      setError(null);
      router.push(`/chat/${id}`);
    } catch (err) {
      console.error("Failed to load conversation:", err);
      setError(t("errorLoadConversation", language));
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError(t("errorInvalidImage", language));
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError(t("errorImageTooLarge", language));
      return;
    }

    // Validate image count per conversation (max 5)
    const existingImageCount = messages.reduce(
      (count, m) => count + m.images.length,
      0
    );
    if (existingImageCount >= 5) {
      setError(t("errorMaxImages", language));
      return;
    }

    setUploadingFile(file);
    setUploadPreview(URL.createObjectURL(file));
    setError(null);
    event.target.value = "";
  }

  function removeUpload() {
    if (uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadingFile(null);
    setUploadPreview(null);
    setError(null);
  }

  /**
   * Guided intake: append a chosen sign to the draft without duplicating one
   * the farmer already added. The draft remains fully editable afterwards.
   */
  function addSymptom(label: string) {
    setDraft((prev) => {
      if (prev.toLowerCase().includes(label.toLowerCase())) return prev;
      const trimmed = prev.trim();
      return trimmed ? `${trimmed}; ${label}` : label;
    });
  }

  async function sendMessage() {
    if (!draft.trim() && !uploadingFile) return;
    setSending(true);
    setError(null);

    try {
      // Ensure we have a conversation
      let convId = currentConversationId;
      if (!convId) {
        const newConv = await createConversation({
          title: draft.trim().slice(0, 50) || "New conversation",
          crop: plant,
          language,
        });
        convId = newConv.id;
        setCurrentConversationId(convId);
        // Keep the URL on the saved conversation so a reload restores it.
        // replaceState avoids a router navigation that would remount the screen
        // while the optimistic message and assessment are still in flight.
        window.history.replaceState(null, "", `/chat/${convId}`);
        setActiveConversation({
          id: newConv.id,
          userId: "",
          title: newConv.title,
          crop: newConv.crop,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
        // Refresh conversation list to include the new one
        await loadConversations();
      }

      // Save user message
      const userMessage = await createMessage({
        conversationId: convId,
        role: "user",
        content: draft.trim(),
        language,
      });

      // Upload image if present. The upload and its binding to the message
      // happen server-side; the caller never supplies Cloudinary IDs directly.
      let imageUrl: string | null = null;
      if (uploadingFile) {
        const formData = new FormData();
        formData.append("file", uploadingFile);
        formData.append("conversationId", String(convId));

        const uploadResult = await uploadCropImage(formData, userMessage.id);
        if ("error" in uploadResult) {
          // Roll back the message saved before the upload so a retry does not
          // leave a duplicate text-only message behind. Keep the draft and photo
          // so the user can retry the attachment.
          try {
            await deleteMessage({ messageId: userMessage.id, conversationId: convId });
          } catch {
            // Ignore rollback failures; the upload error is the primary signal.
          }
          setError(
            safeErrorMessage(uploadResult.error, t("errorInvalidImage", language))
          );
          // Do not assess a photo message without its photo — a photo-only
          // message would otherwise be assessed against empty evidence.
          return;
        } else {
          imageUrl = uploadResult.secureUrl;
        }
      }

      // Add user message to local state
      const newMessage: Message = {
        id: userMessage.id,
        conversationId: convId,
        role: "user",
        content: draft.trim(),
        language,
        status: "sent",
        createdAt: new Date(),
        images: imageUrl ? [{ id: -1, cloudinaryPublicId: "", secureUrl: imageUrl }] : [],
      };

      setMessages((prev) => [...prev, newMessage]);
      setDraft("");
      setUploadingFile(null);
      setUploadPreview(null);

      // Run AI assessment via server action. Evidence (symptoms + images) is
      // derived server-side from the stored message and its attachments. The
      // assistant reply is also created server-side, so it cannot be forged by
      // the caller.
      let assessmentResult: Awaited<ReturnType<typeof runAssessment>> | null =
        null;
      try {
        assessmentResult = await runAssessment({
          conversationId: convId,
          messageId: userMessage.id,
          language,
        });
        setRetryTarget(null);
      } catch {
        // The farmer's question is already saved. Offer a retry instead of
        // losing the message or making them retype it. Do not surface the raw
        // provider error to the farmer.
        setRetryTarget({ conversationId: convId, messageId: userMessage.id });
        setError(t("errorAssessmentFailed", language));
        return;
      }
      if (!assessmentResult) return;

      if (assessmentResult.queued) {
        // The provider chain failed, but the server saved a retry job. Keep the
        // farmer's message and offer an immediate retry as well.
        setRetryTarget({ conversationId: convId, messageId: userMessage.id });
        setError(t("assessmentQueued", language));
        await loadConversations();
        return;
      }

      const { assessment, assistantMessage } = assessmentResult as {
        assessment: NonNullable<Message["assessment"]>;
        assistantMessage: { id: number; content: string };
      };

      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessage.id,
          conversationId: convId,
          role: "assistant",
          content: assistantMessage.content,
          language,
          status: "sent",
          createdAt: new Date(),
          images: [],
          assessment,
        },
      ]);

      // Refresh conversation list to update titles
      await loadConversations();
    } catch (err) {
      console.error("Send failed:", err);
      setError(safeErrorMessage(err, t("errorSendFailed", language)));
    } finally {
      setSending(false);
    }
  }

  async function retryAssessment() {
    if (!retryTarget) return;
    setSending(true);
    setError(null);
    try {
      const assessmentResult = await runAssessment({
        conversationId: retryTarget.conversationId,
        messageId: retryTarget.messageId,
        language,
      });
      if (assessmentResult.queued) {
        setError(t("assessmentQueued", language));
        return;
      }
      const { assessment, assistantMessage } = assessmentResult as {
        assessment: Message["assessment"];
        assistantMessage: { id: number; content: string };
      };
      setMessages((prev) => [
        ...prev,
        {
          id: assistantMessage.id,
          conversationId: retryTarget.conversationId,
          role: "assistant",
          content: assistantMessage.content,
          language,
          status: "sent",
          createdAt: new Date(),
          images: [],
          assessment,
        },
      ]);
      setRetryTarget(null);
      await loadConversations();
    } catch (err) {
      // Provider details stay in the console; farmers get a plain message.
      console.error("Retry assessment failed:", err);
      setError(t("errorAssessmentFailed", language));
    } finally {
      setSending(false);
    }
  }

  async function handleDeleteConversation(id: number) {
    if (!window.confirm(t("deleteConfirm", language))) return;
    try {
      await deleteConversation(id);
      await loadConversations();
      if (currentConversationId === id) {
        newChat();
      }
    } catch {
      setError(t("errorDeleteConversation", language));
    }
  }

  function openFeedback(messageId: number) {
    setFeedbackStage({ messageId, helpful: "" });
    setObservation("");
  }

  function submitFollowUp(messageId: number, helpful: string) {
    setFeedbackStage({ messageId, helpful });
  }

  async function finalizeFollowUp() {
    if (!feedbackStage || !currentConversationId || !feedbackStage.helpful) {
      return;
    }
    setSubmittingFeedback(true);
    setError(null);
    try {
      // The UI choice is yes | no | unsure, while the persisted `outcome`
      // column expects helped | not_helped | unsure.
      const outcome = helpfulToOutcome(feedbackStage.helpful);
      await recordFollowUp({
        conversationId: currentConversationId,
        messageId: feedbackStage.messageId,
        farmerObservation: observation.trim(),
        outcome,
        helpful: feedbackStage.helpful,
      });
      setFeedbackSubmitted(feedbackStage.messageId);
      setFeedbackStage(null);
      setObservation("");
    } catch (err: unknown) {
      setError(safeErrorMessage(err, t("errorFeedbackFailed", language)));
    } finally {
      setSubmittingFeedback(false);
    }
  }

  const isNewChat = !currentConversationId;

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-4 py-5">
        <Brand />
        <Button
          variant="ghost"
          size="icon"
          onClick={newChat}
          aria-label={t("newChat", language)}
          disabled={sending}
        >
          <Plus className="size-5" />
        </Button>
      </div>
      <div className="px-3">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 bg-background"
          onClick={newChat}
          disabled={sending}
        >
          <Plus className="size-4" /> {t("newChat", language)}
        </Button>
      </div>
      <nav aria-label={t("yourConversations", language)} className="mt-7 flex-1 overflow-y-auto px-5 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("yourConversations", language)}
        </p>
        {conversations.length === 0 ? (
          <p className="mt-5 text-sm leading-6 text-muted-foreground">
            {t("conversationsWillAppear", language)}
          </p>
        ) : (
          conversations.map((conv) => (
            <div
              key={conv.id}
              className={cn(
                "group flex items-center rounded-lg transition-colors",
                currentConversationId === conv.id
                  ? "bg-sidebar-accent"
                  : "hover:bg-sidebar-accent"
              )}
            >
              <button
                type="button"
                onClick={() => selectConversation(conv.id)}
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                  currentConversationId === conv.id
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                <Sprout className="size-4" />
                <span className="truncate">{conv.title}</span>
              </button>
              <button
                type="button"
                onClick={() => handleDeleteConversation(conv.id)}
                className="mr-1 rounded-md p-1 text-destructive/60 opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-ring group-hover:opacity-100"
                aria-label={t("deleteConversation", language)}
              >
                <X className="size-4" />
              </button>
            </div>
          ))
        )}
      </nav>
      <div className="border-t px-3 py-3">
        <Link
          href="/profile"
          className={cn(
            "flex items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-sidebar-accent",
            sending ? "opacity-50 pointer-events-none" : ""
          )}
        >
          <Settings className="size-4" /> {t("profileSettings", language)}
        </Link>
        <div className="mt-1 flex items-center justify-between">
          <button
            type="button"
            onClick={async () => {
              await authClient.signOut();
              router.push("/login");
              router.refresh();
            }}
            className={cn(
              "rounded-lg px-2 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:pointer-events-none",
              sending && "disabled:opacity-50 disabled:pointer-events-none"
            )}
            disabled={sending}
          >
            {t("signOut", language)}
          </button>
          <ThemeToggle />
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside className="hidden w-[272px] shrink-0 border-r bg-sidebar md:block">{sidebar}</aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b px-4 md:px-7">
          <div className="flex items-center gap-2">
            <Sheet open={mobileDrawerOpen} onOpenChange={setMobileDrawerOpen}>
              <SheetTrigger render={<Button variant="ghost" size="icon" className="md:hidden" aria-label="Open chat history" />}>
                <Menu className="size-5" />
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] p-0">
                <SheetTitle className="sr-only">{t("yourConversations", language)}</SheetTitle>
                {sidebar}
              </SheetContent>
            </Sheet>
            {isNewChat ? (
              <span className="font-medium">
                {t("newConversationTitle", language)}
              </span>
            ) : (
              <span className="font-medium">
                {activeConversation?.title || t("conversationTitle", language)}
              </span>
            )}
          </div>
          <div className="md:hidden">
            {sending ? (
              <Button variant="ghost" size="icon" disabled aria-label="Processing">
                <RefreshCw className="size-4 animate-spin" />
              </Button>
            ) : (
              <ThemeToggle />
            )}
          </div>
        </header>

        {reminder && !reminderDismissed && (
          <div className="shrink-0 border-b bg-primary/5 px-4 py-3 md:px-7">
            <div className="mx-auto flex w-full max-w-3xl items-start gap-3">
              <Bell className="mt-0.5 size-4 shrink-0 text-primary" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">
                  {t("reminderTitle", language)}
                </p>
                <p className="mt-0.5 text-xs leading-5 text-muted-foreground">
                  {t("reminderBody", language)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <Button
                  size="sm"
                  onClick={() => selectConversation(reminder.conversationId)}
                >
                  {t("reminderAction", language)}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setReminderDismissed(true)}
                >
                  {t("reminderDismiss", language)}
                </Button>
              </div>
            </div>
          </div>
        )}

        <main
          className={`flex min-h-0 flex-1 flex-col ${messages.length ? "" : "justify-center"}`}
        >
          <div
            className={`mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6 ${messages.length ? "min-h-0 flex-1 overflow-y-auto py-8" : ""}`}
          >
            {!messages.length ? (
              <div className="mb-8 text-center">
                <PlantIllustration className="mx-auto mb-4 h-32 w-44" />
                <p className="mb-2 text-sm font-semibold text-primary">{t("yourCropCompanion", language)}</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t("whatIsHappening", language)}
                </h1>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                  {t("describeSigns", language)}
                </p>
                <div className="mx-auto mt-7 max-w-lg">
                  <p className="text-sm font-semibold text-primary">{t("plantQuestion", language)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{t("plantHint", language)}</p>
                  <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                    {PLANT_OPTIONS.map(({ value, labelKey, Icon }) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={plant === value}
                        onClick={() => setPlant(value)}
                        className={cn(
                          "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                          plant === value
                            ? "border-primary bg-primary/10 text-primary"
                            : "bg-card text-muted-foreground hover:border-primary/50"
                        )}
                      >
                        <Icon className="size-4" />
                        {t(labelKey, language)}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mx-auto mt-6 max-w-md">
                  <p className="text-sm font-semibold text-primary">{t("guidedTitle", language)}</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                    {GUIDED_SYMPTOMS.map(({ key, Icon }) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => addSymptom(t(key, language))}
                        className="flex items-center gap-2 rounded-xl border bg-card px-2.5 py-2 text-left text-[11px] font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        <Icon className="size-4 shrink-0 text-primary" />
                        <span>{t(key, language)}</span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="mt-6 grid gap-2 text-left sm:grid-cols-3">
                  {[
                    { Icon: Scan, text: t("tipWholePlant", language) },
                    { Icon: Camera, text: t("tipAffectedPart", language) },
                    { Icon: Sun, text: t("tipGoodLighting", language) },
                  ].map(({ Icon, text }) => (
                    <div
                      key={text}
                      className="flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-[11px] leading-4 text-muted-foreground"
                    >
                      <Icon className="size-4 shrink-0 text-primary" />
                      <span>{text}</span>
                    </div>
                  ))}
                </div>
                <p className="mx-auto mt-8 max-w-md text-xs leading-5 text-muted-foreground">
                  {t("limitationsNotice", language)}
                </p>
              </div>
            ) : (
              <div className="space-y-6" aria-live="polite">
                {messages.map((message) => (
                  <article
                    key={message.id}
                    className={cn(
                      "flex",
                      message.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-6",
                        message.role === "user"
                          ? "rounded-tr-sm bg-primary text-primary-foreground"
                          : "rounded-tl-sm bg-muted text-muted-foreground dark:bg-muted dark:text-muted-foreground"
                      )}
                    >
                      {message.images.length > 0 && (
                        <div className="mb-3 flex gap-2">
                          {message.images.map((img) => (
                            <Image
                              key={img.id}
                              src={img.secureUrl}
                              alt="Crop photo attached to message"
                              width={128}
                              height={96}
                              className="h-24 w-32 rounded-lg object-cover"
                            />
                          ))}
                        </div>
                      )}
                      {/* Assistant messages with structured assessments render the
                          cards below; the stored markdown summary would duplicate
                          the same advice verbatim. */}
                      {!(message.role === "assistant" && message.assessment) &&
                        message.content}
                      {message.role === "assistant" && message.assessment && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          {message.assessment.imageIssues &&
                            message.assessment.imageIssues.failed > 0 && (
                              <div
                                role="status"
                                className="mb-2 rounded-md bg-destructive/10 px-2 py-1.5 text-xs text-destructive"
                              >
                                {t("imageNotExamined", language)}
                              </div>
                            )}
                          <div className="space-y-3">
                            {message.assessment.immediateActions.length > 0 && (
                              <AssessmentRow
                                icon={<ListChecks className="size-3.5" />}
                                title={t("suggestedActions", language)}
                              >
                                <ol className="space-y-1">
                                  {message.assessment.immediateActions.map(
                                    (action, index) => (
                                      <li key={action} className="flex gap-2">
                                        <span className="font-semibold text-primary">
                                          {index + 1}.
                                        </span>
                                        <span>{action}</span>
                                      </li>
                                    )
                                  )}
                                </ol>
                              </AssessmentRow>
                            )}
                            {message.assessment.observedSigns.length > 0 && (
                              <AssessmentRow
                                icon={<Eye className="size-3.5" />}
                                title={t("observedSigns", language)}
                              >
                                <ul className="space-y-1">
                                  {message.assessment.observedSigns.map(
                                    (sign) => (
                                      <li key={sign} className="flex gap-2">
                                        <Leaf className="mt-0.5 size-3 shrink-0 text-primary/70" />
                                        <span>{sign}</span>
                                      </li>
                                    )
                                  )}
                                </ul>
                              </AssessmentRow>
                            )}
                            {message.assessment.possibleCauses.length > 0 && (
                              <AssessmentRow
                                icon={<Info className="size-3.5" />}
                                title={t("possibleCauses", language)}
                              >
                                <ul className="space-y-1">
                                  {message.assessment.possibleCauses.map(
                                    (cause) => (
                                      <li key={cause}>{cause}</li>
                                    )
                                  )}
                                </ul>
                              </AssessmentRow>
                            )}
                            {message.assessment.followUpQuestions.length > 0 && (
                              <AssessmentRow
                                icon={<Search className="size-3.5" />}
                                title={t("thingsToCheck", language)}
                              >
                                <ul className="space-y-1">
                                  {message.assessment.followUpQuestions.map(
                                    (question) => (
                                      <li key={question}>{question}</li>
                                    )
                                  )}
                                </ul>
                              </AssessmentRow>
                            )}
                          </div>
                          {message.assessment.whenToSeekHelp && (
                            <div className="mt-3">
                              <AssessmentRow
                                icon={<AlertTriangle className="size-3.5" />}
                                title={t("whenToSeekHelp", language)}
                                tone="warn"
                              >
                                <p>{message.assessment.whenToSeekHelp}</p>
                              </AssessmentRow>
                            </div>
                          )}
                          {message.assessment.uncertainty.level !== "low" && (
                            <div className="mt-2">
                              <AssessmentRow
                                icon={<Info className="size-3.5" />}
                                title={t("uncertainty", language)}
                                tone="warn"
                              >
                                <p>
                                  {message.assessment.uncertainty.level} —{" "}
                                  {message.assessment.uncertainty.reason}
                                </p>
                              </AssessmentRow>
                            </div>
                          )}
                          <p className="mt-3 text-[11px] leading-4 text-muted-foreground/80">
                            {t("limitationsNotice", language)}
                          </p>
                          {feedbackSubmitted !== message.id &&
                            (feedbackStage?.messageId === message.id ? (
                              <div className="mt-3 pt-3 border-t border-border/50">
                                <p className="text-xs font-semibold text-primary mb-2">
                                  {t("feedbackQuestion", language)}
                                </p>
                                <div className="mb-3 flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant={
                                      feedbackStage.helpful === "yes"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => submitFollowUp(message.id, "yes")}
                                  >
                                    {t("outcomeHelped", language)}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={
                                      feedbackStage.helpful === "no"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => submitFollowUp(message.id, "no")}
                                  >
                                    {t("outcomeNotHelped", language)}
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant={
                                      feedbackStage.helpful === "unsure"
                                        ? "default"
                                        : "outline"
                                    }
                                    onClick={() => submitFollowUp(message.id, "unsure")}
                                  >
                                    {t("outcomeUnsure", language)}
                                  </Button>
                                </div>
                                <Label htmlFor={`follow-up-observation-${message.id}`}>
                                  {t("observationLabel", language)}
                                </Label>
                                <Textarea
                                  id={`follow-up-observation-${message.id}`}
                                  value={observation}
                                  onChange={(e) => setObservation(e.target.value)}
                                  placeholder={t("observationPlaceholder", language)}
                                  className="mt-2 h-24"
                                  disabled={submittingFeedback}
                                />
                                <Button
                                  onClick={finalizeFollowUp}
                                  disabled={
                                    submittingFeedback ||
                                    !feedbackStage.helpful ||
                                    !observation.trim()
                                  }
                                  className="mt-2 w-full"
                                >
                                  {submittingFeedback
                                    ? t("submitting", language)
                                    : t("submitFeedback", language)}
                                </Button>
                              </div>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="mt-3"
                                onClick={() => openFeedback(message.id)}
                              >
                                {t("feedbackTitle", language)}
                              </Button>
                            ))}
                          {feedbackSubmitted === message.id && (
                            <p className="mt-2 text-xs text-muted-foreground">
                              {t("thankYouFeedback", language)}
                            </p>
                          )}
                        </div>
                      )}
                      {message.role === "assistant" && !message.assessment && (
                        <p className="mt-2 text-xs text-muted-foreground">
                          {t("cropAssessment", language)} · {message.language}
                        </p>
                      )}
                    </div>
                  </article>
                ))}
                {sending && (
                  <div className="flex justify-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {t("analyzing", language)}
                    </div>
                  </div>
                )}
                <div ref={endRef} />
              </div>
            )}
          </div>
        </main>

        <div
          className={`mx-auto w-full max-w-3xl px-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 ${messages.length ? "pt-3" : ""}`}
        >
          <div className="rounded-2xl border bg-card p-3 shadow-[0_12px_36px_-24px_rgba(0,0,0,.45)]">
            {uploadingFile && (
              <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted p-2 text-xs">
                <Camera className="size-4" />
                <span className="min-w-0 flex-1 truncate">{uploadingFile.name}</span>
                <button aria-label="Remove photo" onClick={removeUpload}>
                  <X className="size-4" />
                </button>
              </div>
            )}
            {error && (
              <div
                role="alert"
                className="mb-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
              >
                <p>{error}</p>
                {retryTarget && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={retryAssessment}
                    disabled={sending}
                  >
                    <RefreshCw className="size-3.5" />
                    {t("retry", language)}
                  </Button>
                )}
              </div>
            )}
            <Textarea
              aria-label={t("messageLabel", language)}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={t("placeholderMessage", language)}
              className="min-h-16 resize-none border-0 bg-transparent text-foreground shadow-none focus-visible:ring-0"
              disabled={sending}
            />
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1">
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={sending || !!uploadingFile}
                />
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("attachPhoto", language)}
                  title={t("attachPhoto", language)}
                  onClick={() => fileRef.current?.click()}
                  disabled={sending || !!uploadingFile}
                >
                  <Camera className="size-4" />
                </Button>
                <select
                  aria-label={t("conversationLanguage", language)}
                  value={language}
                  onChange={async (event) => {
                    const next = event.target.value as Language;
                    const result = await authClient.updateUser({
                      preferredLanguage: next,
                    });
                    if (!result.error) {
                      setLanguage(next);
                      setPreferredLanguage(next);
                    }
                  }}
                  className={cn(
                    "rounded-lg bg-transparent px-2 py-2 text-xs font-medium text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none",
                    sending && "disabled:opacity-50 disabled:pointer-events-none"
                  )}
                  disabled={sending}
                >
                  {languages.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                size="icon"
                aria-label={t("sendMessage", language)}
                disabled={(!draft.trim() && !uploadingFile) || sending}
                onClick={sendMessage}
                className="rounded-xl"
              >
                <ArrowUp className="size-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
