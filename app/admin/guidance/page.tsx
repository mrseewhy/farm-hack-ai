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
  reviewer: string | null;
  reviewedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

const STATUS_CONFIG: Record<string, { label: string; variant: string }> = {
  draft: { label: "Draft", variant: "outline" },
  in_review: { label: "In review", variant: "default" },
  published: { label: "Published", variant: "default" },
};

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
  const [form, setForm] = useState<KnowledgeArticleInput>({
    crop: "tomato",
    problem: "",
    signs: "",
    distinguishingQuestions: "",
    approvedActions: "",
    status: "draft",
    version: "1.0",
    reviewer: undefined,
  });

  const [publishReviewer, setPublishReviewer] = useState("");

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
    setForm({
      crop: "tomato",
      problem: "",
      signs: "",
      distinguishingQuestions: "",
      approvedActions: "",
      status: "draft",
      version: "1.0",
      reviewer: undefined,
    });
    setPublishReviewer("");
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
        reviewer: form.reviewer,
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
    if (openPublish === null || !publishReviewer.trim()) return;
    setSaving(true);
    try {
      await publishKnowledgeArticle(openPublish, publishReviewer.trim());
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
      reviewer: article.reviewer ?? undefined,
    });
    setOpenEdit(article.id);
  };

  const statusCfg = STATUS_CONFIG;

  return (
    <AdminShell
      title="Crop guidance"
      subtitle="Keep farmer-facing advice accurate and reviewed."
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
                    <Badge
                      variant={cfg.variant as "default" | "outline"}
                      className="text-xs uppercase tracking-tight"
                    >
                      {cfg.label}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    {article.reviewer && (
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
                        onClick={() => setOpenPublish(article.id)}
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
                        Approved actions
                      </p>
                      <p className="text-sm">{article.approvedActions}</p>
                    </div>
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
            <p className="text-sm">
              Publishing makes this guidance available to the AI crop assessment
              pipeline. Provide the name of the agricultural expert who reviewed
              this article.
            </p>
            <div className="space-y-2">
              <Label>Reviewer name</Label>
              <Input
                value={publishReviewer}
                onChange={(e) => setPublishReviewer(e.target.value)}
              />
            </div>
          </CardContent>
          <div className="p-4 flex justify-end space-x-2">
            <Button
              variant="outline"
              onClick={() => {
                setPublishReviewer("");
                setOpenPublish(null);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handlePublish}
              disabled={saving || !publishReviewer.trim()}
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
