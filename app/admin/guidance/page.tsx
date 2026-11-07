"use client";

import { useEffect, useState } from "react";
import {
  createKnowledgeArticle,
  getKnowledgeArticles,
  publishKnowledgeArticle,
  setKnowledgeArticleInReview,
  updateKnowledgeArticle,
  type KnowledgeArticleInput,
} from "@/lib/data/actions/admin";
import { AdminShell } from "@/components/app/admin-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import {
  Plus,
  Edit2,
  Globe,
  FileText,
  Loader2,
} from "lucide-react";

type Article = {
  id: number;
  crop: string;
  problem: string;
  signs: string;
  distinguishingQuestions: string;
  approvedActions: string;
  status: "draft" | "in_review" | "published";
  version: string;
  provenance: "source_backed" | "expert_reviewed";
  reviewer: string | null;
  reviewedAt: Date | null;
  sourcePublisher: string | null;
  sourceTitle: string | null;
  sourceUrl: string | null;
  sourceAccessedAt: Date | null;
  sourceLicense: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  draft: { label: "Draft", variant: "outline" },
  in_review: { label: "In review", variant: "default" },
  published: { label: "Published", variant: "default" },
};

const PROVENANCE_CONFIG: Record<
  "source_backed" | "expert_reviewed",
  { label: string; variant: "outline" | "secondary"; help: string }
> = {
  source_backed: {
    label: "Source-backed",
    variant: "outline",
    help: "Paraphrased from a cited public source. Not reviewed by an agricultural expert.",
  },
  expert_reviewed: {
    label: "Expert-reviewed",
    variant: "secondary",
    help: "Reviewed by a named, qualified agricultural expert. Only use this if a real expert reviewed it.",
  },
};

const EMPTY_FORM: KnowledgeArticleInput = {
  crop: "tomato",
  problem: "",
  signs: "",
  distinguishingQuestions: "",
  approvedActions: "",
  status: "draft",
  version: "1.0",
  provenance: "source_backed",
  reviewer: undefined,
  reviewedAt: undefined,
  sourcePublisher: undefined,
  sourceTitle: undefined,
  sourceUrl: undefined,
  sourceAccessedAt: undefined,
  sourceLicense: undefined,
};

/** Format a nullable date for a text input (YYYY-MM-DD). */
function toDateInput(value: Date | string | null | undefined): string {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export default function GuidancePage() {
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Sheet state
  const [openCreate, setOpenCreate] = useState(false);
  const [openEdit, setOpenEdit] = useState<number | null>(null);
  const [openPublish, setOpenPublish] = useState<number | null>(null);

  // Form state (shared by create and edit)
  const [form, setForm] = useState<KnowledgeArticleInput>({ ...EMPTY_FORM });

  // Reviewer details captured when publishing expert-reviewed content.
  const [publishReviewer, setPublishReviewer] = useState("");
  const [publishReviewedAt, setPublishReviewedAt] = useState("");

  async function reloadArticles() {
    try {
      const data = (await getKnowledgeArticles()) as unknown as Article[];
      setArticles(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load guidance articles.");
    }
  }

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      setError("");
      try {
        const data = (await getKnowledgeArticles()) as unknown as Article[];
        if (mounted) {
          setArticles(data);
          setLoading(false);
        }
      } catch (err: unknown) {
        if (mounted) {
          setError(err instanceof Error ? err.message : "Failed to load guidance articles.");
          setLoading(false);
        }
      }
    };
    init();
    return () => {
      mounted = false;
    };
  }, []);

  const resetForm = () => {
    setForm({ ...EMPTY_FORM });
    setPublishReviewer("");
    setPublishReviewedAt("");
  };

  /** Open the publish dialog for an article, pre-filling expert review details. */
  const openPublishFor = (article: Article) => {
    setPublishReviewer(article.reviewer ?? "");
    setPublishReviewedAt(toDateInput(article.reviewedAt));
    setOpenPublish(article.id);
  };

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      await createKnowledgeArticle({
        crop: form.crop,
        problem: form.problem,
        signs: form.signs,
        distinguishingQuestions: form.distinguishingQuestions,
        approvedActions: form.approvedActions,
        status: "draft",
        version: form.version,
        provenance: form.provenance,
        reviewer: form.reviewer,
        reviewedAt: form.reviewedAt,
        sourcePublisher: form.sourcePublisher,
        sourceTitle: form.sourceTitle,
        sourceUrl: form.sourceUrl,
        sourceAccessedAt: form.sourceAccessedAt,
        sourceLicense: form.sourceLicense,
      });
      resetForm();
      setOpenCreate(false);
      await reloadArticles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create article.");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (openEdit === null) return;
    setSaving(true);
    try {
      await updateKnowledgeArticle(openEdit, {
        crop: form.crop,
        problem: form.problem,
        signs: form.signs,
        distinguishingQuestions: form.distinguishingQuestions,
        approvedActions: form.approvedActions,
        status: form.status,
        version: form.version,
        provenance: form.provenance,
        reviewer: form.reviewer,
        reviewedAt: form.reviewedAt,
        sourcePublisher: form.sourcePublisher,
        sourceTitle: form.sourceTitle,
        sourceUrl: form.sourceUrl,
        sourceAccessedAt: form.sourceAccessedAt,
        sourceLicense: form.sourceLicense,
      });
      resetForm();
      setOpenEdit(null);
      await reloadArticles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to update article.");
    } finally {
      setSaving(false);
    }
  };

  const handleReview = async (id: number) => {
    setSaving(true);
    try {
      await setKnowledgeArticleInReview(id);
      await reloadArticles();
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Failed to send article to review."
      );
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (openPublish === null) return;
    const target = articles.find((a) => a.id === openPublish);
    if (!target) return;

    const isExpert = target.provenance === "expert_reviewed";
    // Expert-reviewed content must name the reviewer; source-backed content
    // must not imply one, so no reviewer is collected for it.
    if (isExpert && !publishReviewer.trim()) return;

    setSaving(true);
    try {
      await publishKnowledgeArticle(
        openPublish,
        isExpert
          ? {
              reviewer: publishReviewer.trim(),
              reviewedAt: publishReviewedAt || undefined,
            }
          : undefined
      );
      resetForm();
      setOpenPublish(null);
      await reloadArticles();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to publish article.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (article: Article) => {
    setForm({
      crop: article.crop,
      problem: article.problem,
      signs: article.signs,
      distinguishingQuestions: article.distinguishingQuestions,
      approvedActions: article.approvedActions,
      status: article.status,
      version: article.version,
      provenance: article.provenance,
      reviewer: article.reviewer ?? undefined,
      reviewedAt: toDateInput(article.reviewedAt) || undefined,
      sourcePublisher: article.sourcePublisher ?? undefined,
      sourceTitle: article.sourceTitle ?? undefined,
      sourceUrl: article.sourceUrl ?? undefined,
      sourceAccessedAt: toDateInput(article.sourceAccessedAt) || undefined,
      sourceLicense: article.sourceLicense ?? undefined,
    });
    setOpenEdit(article.id);
  };

  const statusCfg = STATUS_CONFIG;
  const provenanceCfg = PROVENANCE_CONFIG;
  const publishTarget =
    openPublish === null
      ? null
      : articles.find((a) => a.id === openPublish) ?? null;

  return (
    <AdminShell
      title="Crop guidance"
      subtitle="Curate advice with clear provenance. Published source-backed guidance is never presented as expert-reviewed."
    >
      {error && (
        <div className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      <div className="flex items-center justify-between mb-6">
        <Button
          onClick={() => {
            resetForm();
            setOpenCreate(true);
          }}
          disabled={saving}
        >
          <Plus className="size-4 mr-2" /> Create guidance article
        </Button>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="mb-2 size-6 animate-spin" />
          <p className="text-sm text-muted-foreground">
            Loading guidance articles...
          </p>
        </div>
      ) : articles.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <FileText className="mb-3 size-6 text-muted-foreground" />
            <h3 className="font-medium">No guidance articles yet</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Create and review crop guidance before it is used in farmer advice.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {articles.map((article) => {
            const cfg = statusCfg[article.status];
            return (
              <Card key={article.id} className="border-border/70 shadow-none">
                <CardHeader
                  className="flex flex-row items-center justify-between space-y-0 pb-3"
                >
                  <div className="flex items-start gap-4 flex-1">
                    <div className="flex-1">
                      <CardTitle className="text-base">
                        {article.problem}
                      </CardTitle>
                      <p className="text-xs text-muted-foreground mb-1">
                        {article.crop} · v{article.version}
                      </p>
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {article.signs}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <Badge
                        variant={cfg.variant as "default" | "outline"}
                        className="text-xs uppercase tracking-tight"
                      >
                        {cfg.label}
                      </Badge>
                      <Badge
                        variant={
                          provenanceCfg[article.provenance].variant as
                            | "outline"
                            | "secondary"
                        }
                        className="text-[10px]"
                      >
                        {provenanceCfg[article.provenance].label}
                      </Badge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {article.provenance === "expert_reviewed" &&
                      article.reviewer && (
                        <span className="text-xs text-muted-foreground">
                          Reviewed by {article.reviewer}
                        </span>
                      )}
                    {article.status !== "published" && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEdit(article)}
                        disabled={saving}
                      >
                        <Edit2 className="size-4" /> Edit
                      </Button>
                    )}
                    {article.status === "draft" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => handleReview(article.id)}
                        disabled={saving}
                      >
                        Send to review
                      </Button>
                    )}
                    {article.status === "in_review" && (
                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => openPublishFor(article)}
                        disabled={saving}
                      >
                        Publish
                      </Button>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase mb-1">
                        Signs
                      </p>
                      <p className="text-sm">{article.signs}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-[10px] uppercase mb-1">
                        Distinguishing questions
                      </p>
                      <p className="text-sm">{article.distinguishingQuestions}</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-muted-foreground text-[10px] uppercase mb-1">
                        Safe actions
                      </p>
                      <p className="text-sm">{article.approvedActions}</p>
                    </div>
                    {article.provenance === "source_backed" && (
                      <div className="sm:col-span-2 rounded-md bg-muted/50 p-2">
                        <p className="text-muted-foreground text-[10px] uppercase mb-1">
                          Source (not expert-reviewed)
                        </p>
                        <p className="text-sm">
                          {article.sourcePublisher ?? "No publisher"}
                          {article.sourceTitle ? ` — ${article.sourceTitle}` : ""}
                        </p>
                        {article.sourceUrl && (
                          <p className="text-xs text-muted-foreground break-all">
                            {article.sourceUrl}
                          </p>
                        )}
                        {article.sourceLicense && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Terms: {article.sourceLicense}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                    <Globe className="size-3.5" />
                    <span>
                      Used in AI assessment context when published
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Create article sheet */}
      <Sheet open={openCreate} onOpenChange={setOpenCreate}>
        <SheetTrigger render={<button className="hidden" aria-hidden="true" />}>
        </SheetTrigger>
        <SheetContent>
          <SheetContentHeader>
            <SheetContentTitle>Create guidance article</SheetContentTitle>
          </SheetContentHeader>
          <form onSubmit={handleCreate} className="space-y-4 p-4">
            <div className="space-y-2">
              <Label>Crop</Label>
              <Input
                value={form.crop}
                onChange={(e) =>
                  setForm({ ...form, crop: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Problem</Label>
              <Input
                value={form.problem}
                onChange={(e) =>
                  setForm({ ...form, problem: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Signs</Label>
              <Textarea
                value={form.signs}
                onChange={(e) =>
                  setForm({ ...form, signs: e.target.value })
                }
                className="h-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Distinguishing questions</Label>
              <Textarea
                value={form.distinguishingQuestions}
                onChange={(e) =>
                  setForm({
                    ...form,
                    distinguishingQuestions: e.target.value,
                  })
                }
                className="h-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Approved actions</Label>
              <Textarea
                value={form.approvedActions}
                onChange={(e) =>
                  setForm({ ...form, approvedActions: e.target.value })
                }
                className="h-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) =>
                  setForm({ ...form, version: e.target.value })
                }
              />
            </div>
            <ProvenanceFields form={form} setForm={setForm} />
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Creating…" : "Create article"}
            </Button>
          </form>
          <div className="p-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setOpenCreate(false);
              }}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Edit article sheet */}
      <Sheet open={openEdit !== null} onOpenChange={(open) => {
        if (!open) setOpenEdit(null);
      }}>
        <SheetTrigger render={<button className="hidden" aria-hidden="true" />}>
        </SheetTrigger>
        <SheetContent>
          <SheetContentHeader>
            <SheetContentTitle>Edit guidance article</SheetContentTitle>
          </SheetContentHeader>
          <form onSubmit={handleUpdate} className="space-y-4 p-4">
            <div className="space-y-2">
              <Label>Status</Label>
              <select
                value={form.status}
                onChange={(e) =>
                  setForm({
                    ...form,
                    status: e.target.value as "draft" | "in_review" | "published",
                  })
                }
                className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="draft">Draft</option>
                <option value="in_review">In review</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label>Crop</Label>
              <Input
                value={form.crop}
                onChange={(e) =>
                  setForm({ ...form, crop: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Problem</Label>
              <Input
                value={form.problem}
                onChange={(e) =>
                  setForm({ ...form, problem: e.target.value })
                }
              />
            </div>
            <div className="space-y-2">
              <Label>Signs</Label>
              <Textarea
                value={form.signs}
                onChange={(e) =>
                  setForm({ ...form, signs: e.target.value })
                }
                className="h-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Distinguishing questions</Label>
              <Textarea
                value={form.distinguishingQuestions}
                onChange={(e) =>
                  setForm({
                    ...form,
                    distinguishingQuestions: e.target.value,
                  })
                }
                className="h-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Approved actions</Label>
              <Textarea
                value={form.approvedActions}
                onChange={(e) =>
                  setForm({ ...form, approvedActions: e.target.value })
                }
                className="h-32"
              />
            </div>
            <div className="space-y-2">
              <Label>Version</Label>
              <Input
                value={form.version}
                onChange={(e) =>
                  setForm({ ...form, version: e.target.value })
                }
              />
            </div>
            <ProvenanceFields form={form} setForm={setForm} />
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Saving…" : "Save changes"}
            </Button>
          </form>
          <div className="p-4 flex justify-end">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                setOpenEdit(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Publish article sheet */}
      <Sheet open={openPublish !== null} onOpenChange={(open) => {
        if (!open) setOpenPublish(null);
      }}>
        <SheetTrigger render={<button className="hidden" aria-hidden="true" />}>
        </SheetTrigger>
        <SheetContent>
          <SheetContentHeader>
            <SheetContentTitle>Publish guidance article</SheetContentTitle>
          </SheetContentHeader>
          <CardContent className="p-4 space-y-4">
            {publishTarget?.provenance === "expert_reviewed" ? (
              <>
                <p className="text-sm">
                  Publishing makes this guidance available to the AI crop
                  assessment pipeline. This article is marked{" "}
                  <strong>expert-reviewed</strong>, so record the qualified
                  expert who reviewed it.
                </p>
                <div className="space-y-2">
                  <Label>Reviewer name</Label>
                  <Input
                    value={publishReviewer}
                    onChange={(e) => setPublishReviewer(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Review date</Label>
                  <Input
                    type="date"
                    value={publishReviewedAt}
                    onChange={(e) => setPublishReviewedAt(e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <p className="text-sm">
                  Publishing makes this guidance available to the AI crop
                  assessment pipeline as{" "}
                  <strong>source-backed reference material</strong>. It will be
                  labelled source-backed and will NOT be presented as
                  expert-reviewed.
                </p>
                <div className="rounded-md bg-muted/50 p-3 text-sm">
                  <p className="font-medium">
                    {publishTarget?.sourcePublisher ?? "No publisher recorded"}
                  </p>
                  {publishTarget?.sourceTitle && (
                    <p className="text-muted-foreground">
                      {publishTarget.sourceTitle}
                    </p>
                  )}
                  {publishTarget?.sourceUrl && (
                    <p className="text-xs text-muted-foreground break-all">
                      {publishTarget.sourceUrl}
                    </p>
                  )}
                </div>
                {publishTarget &&
                  (!publishTarget.sourcePublisher ||
                    !publishTarget.sourceTitle ||
                    !publishTarget.sourceUrl) && (
                    <p className="text-sm text-destructive">
                      Add the source publisher, title, and URL before publishing.
                    </p>
                  )}
              </>
            )}
          </CardContent>
          <div className="p-4 flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                setPublishReviewer("");
                setPublishReviewedAt("");
                setOpenPublish(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={
                saving ||
                (publishTarget?.provenance === "expert_reviewed" &&
                  !publishReviewer.trim())
              }
            >
              {saving ? "Publishing…" : "Publish"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}

// Small helper components so SheetContent has a consistent header without
// importing shadcn SheetHeader (which isn't exported from this project's sheet).
function SheetContentHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between pb-2">
      {children}
    </div>
  );
}

function SheetContentTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-lg font-semibold">{children}</h2>
  );
}

/**
 * Provenance + source fields, shared by the create and edit forms.
 * The fields shown depend on the chosen provenance so an admin filling in a
 * source-backed article is never asked to name an expert (which would imply a
 * review that did not happen).
 */
function ProvenanceFields({
  form,
  setForm,
}: {
  form: KnowledgeArticleInput;
  setForm: React.Dispatch<React.SetStateAction<KnowledgeArticleInput>>;
}) {
  const provenance = form.provenance ?? "source_backed";
  const isSource = provenance !== "expert_reviewed";

  return (
    <div className="space-y-3 rounded-lg border border-border/70 p-3">
      <div className="space-y-2">
        <Label>Provenance</Label>
        <select
          value={provenance}
          onChange={(e) =>
            setForm({
              ...form,
              provenance: e.target.value as "source_backed" | "expert_reviewed",
            })
          }
          className="flex h-10 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <option value="source_backed">
            Source-backed (cited public reference)
          </option>
          <option value="expert_reviewed">
            Expert-reviewed (qualified human reviewed it)
          </option>
        </select>
        <p className="text-xs text-muted-foreground">
          {PROVENANCE_CONFIG[provenance].help}
        </p>
      </div>

      {isSource ? (
        <>
          <div className="space-y-2">
            <Label>Source publisher</Label>
            <Input
              value={form.sourcePublisher ?? ""}
              onChange={(e) =>
                setForm({ ...form, sourcePublisher: e.target.value })
              }
              placeholder="e.g. University of California Statewide IPM Program"
            />
          </div>
          <div className="space-y-2">
            <Label>Source title</Label>
            <Input
              value={form.sourceTitle ?? ""}
              onChange={(e) =>
                setForm({ ...form, sourceTitle: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Source URL</Label>
            <Input
              value={form.sourceUrl ?? ""}
              onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="space-y-2">
            <Label>Source access date</Label>
            <Input
              type="date"
              value={form.sourceAccessedAt ?? ""}
              onChange={(e) =>
                setForm({ ...form, sourceAccessedAt: e.target.value })
              }
            />
          </div>
          <div className="space-y-2">
            <Label>Source terms / licence</Label>
            <Input
              value={form.sourceLicense ?? ""}
              onChange={(e) =>
                setForm({ ...form, sourceLicense: e.target.value })
              }
              placeholder="e.g. educational, noncommercial use with attribution"
            />
          </div>
        </>
      ) : (
        <>
          <div className="space-y-2">
            <Label>Reviewer name</Label>
            <Input
              value={form.reviewer ?? ""}
              onChange={(e) => setForm({ ...form, reviewer: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Review date</Label>
            <Input
              type="date"
              value={form.reviewedAt ?? ""}
              onChange={(e) => setForm({ ...form, reviewedAt: e.target.value })}
            />
          </div>
        </>
      )}
    </div>
  );
}
