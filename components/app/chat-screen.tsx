"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import { ArrowUp, Camera, Menu, Plus, Settings, Sprout, X, RefreshCw } from "lucide-react";
import { Brand } from "@/components/app/brand";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { languages, type Language, setPreferredLanguage } from "@/lib/preferences";
import { t } from "@/lib/i18n";
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
      setDraft("");
      setUploadingFile(null);
      setUploadPreview(null);
      setError(null);
      router.push(`/chat/${id}`);
    } catch (err) {
      console.error("Failed to load conversation:", err);
      setError("Failed to load conversation. Please try again.");
    }
  }

  async function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      setError("Invalid image type. Use JPEG, PNG, or WebP.");
      return;
    }

    // Validate file size (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError("Image too large. Maximum 10MB.");
      return;
    }

    // Validate image count per conversation (max 5)
    const existingImageCount = messages.reduce(
      (count, m) => count + m.images.length,
      0
    );
    if (existingImageCount >= 5) {
      setError("Maximum 5 images per conversation reached.");
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
          crop: "tomato",
          language,
        });
        convId = newConv.id;
        setCurrentConversationId(convId);
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
          setError(uploadResult.error ?? "Upload failed");
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

      const { assessment, assistantMessage } = assessmentResult as {
        assessment: {
          observedSigns: string[];
          possibleCauses: string[];
          followUpQuestions: string[];
          immediateActions: string[];
          whenToSeekHelp: string;
          uncertainty: { level: "low" | "medium" | "high"; reason: string };
        };
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
      setError(err instanceof Error ? err.message : "Failed to send message. Please try again.");
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
      setError("Failed to delete conversation.");
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
      await recordFollowUp({
        conversationId: currentConversationId,
        messageId: feedbackStage.messageId,
        farmerObservation: observation.trim(),
        outcome: feedbackStage.helpful,
        helpful: feedbackStage.helpful,
      });
      setFeedbackSubmitted(feedbackStage.messageId);
      setFeedbackStage(null);
      setObservation("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit feedback. Please try again.");
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

        <main
          className={`flex min-h-0 flex-1 flex-col ${messages.length ? "" : "justify-center"}`}
        >
          <div
            className={`mx-auto flex w-full max-w-3xl flex-col px-4 sm:px-6 ${messages.length ? "min-h-0 flex-1 overflow-y-auto py-8" : ""}`}
          >
            {!messages.length ? (
              <div className="mb-8 text-center">
                <div className="mx-auto mb-5 flex size-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                  <Sprout className="size-7" />
                </div>
                <p className="mb-2 text-sm font-semibold text-primary">{t("yourCropCompanion", language)}</p>
                <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                  {t("whatIsHappening", language)}
                </h1>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground sm:text-base">
                  {t("describeSigns", language)}
                </p>
                <div className="mt-8 max-w-sm mx-auto">
                  <h3 className="text-sm font-semibold text-primary mb-2">{t("photoTips", language)}</h3>
                  <ul className="text-sm text-muted-foreground space-y-2 list-disc pl-4">
                    <li>{t("tipWholePlant", language)}</li>
                    <li>{t("tipAffectedPart", language)}</li>
                    <li>{t("tipGoodLighting", language)}</li>
                  </ul>
                </div>
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
                            <img
                              key={img.id}
                              src={img.secureUrl}
                              alt="Crop photo attached to message"
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
                          {message.assessment.observedSigns.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-primary mb-1">{t("observedSigns", language)}</p>
                              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                {message.assessment.observedSigns.map((sign) => (
                                  <li key={sign}>{sign}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {message.assessment.possibleCauses.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-primary mb-1">{t("possibleCauses", language)}</p>
                              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                {message.assessment.possibleCauses.map((cause) => (
                                  <li key={cause}>{cause}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {message.assessment.followUpQuestions.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-primary mb-1">{t("thingsToCheck", language)}</p>
                              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                {message.assessment.followUpQuestions.map((q) => (
                                  <li key={q}>{q}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {message.assessment.immediateActions.length > 0 && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-primary mb-1">{t("suggestedActions", language)}</p>
                              <ul className="text-xs text-muted-foreground space-y-1 list-disc pl-4">
                                {message.assessment.immediateActions.map((a) => (
                                  <li key={a}>{a}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {message.assessment.whenToSeekHelp && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-primary mb-1">{t("whenToSeekHelp", language)}</p>
                              <p className="text-xs text-muted-foreground">{message.assessment.whenToSeekHelp}</p>
                            </div>
                          )}
                          {message.assessment.uncertainty.level !== "low" && (
                            <div className="mb-2">
                              <p className="text-xs font-semibold text-primary mb-1">{t("uncertainty", language)}</p>
                              <p className="text-xs text-muted-foreground">
                                {message.assessment.uncertainty.level} — {message.assessment.uncertainty.reason}
                              </p>
                            </div>
                          )}
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
              className="min-h-16 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
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
