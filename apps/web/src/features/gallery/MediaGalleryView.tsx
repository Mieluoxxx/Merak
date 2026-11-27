import { API_ROUTES, type MediaWithRefsDto, type SpaceDto } from "@merak/shared";
import {
  AlertDialog,
  AlertDialogBackdrop,
  AlertDialogClose,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
  EmptyState,
  FileInput,
  FileInputDropzone,
  FileInputTrigger,
  Inline,
  Menu,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
  SegmentedControl,
  SegmentedControlIndicator,
  SegmentedControlItem,
  Stack,
  toast,
} from "@merak/ui";
import { colors, font, radius, space } from "@merak/ui/tokens.stylex";
import * as stylex from "@stylexjs/stylex";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronDown,
  Copy,
  File as FileIcon,
  FileText,
  Filter,
  Image as ImageIcon,
  Link2,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { useMemo, useState } from "react";
import {
  deleteMedia,
  fetchMediaList,
  fetchSpaces,
  formatBytes,
  shortHash,
  uploadMediaFile,
  workspaceQueryKeys,
} from "../api/workspace-api.js";

export interface MediaGalleryViewProps {
  spaces?: SpaceDto[];
  defaultSpaceId?: string | null;
  onOpenNode?: (nodeId: string) => void;
  resolveNodeTitle?: (nodeId: string) => string | undefined;
}

type GalleryFilterMode = "all" | "orphans";

const styles = stylex.create({
  root: {
    display: "flex",
    flexDirection: "column",
    gap: space.lg,
    width: "100%",
    maxWidth: "1080px",
    marginInline: "auto",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: space.md,
    flexWrap: "wrap",
    paddingBottom: space.lg,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
  },
  title: {
    margin: 0,
    fontSize: font.sizeXl,
    fontWeight: 600,
    letterSpacing: "-0.02em",
  },
  subtitle: {
    margin: 0,
    marginTop: space.xs,
    fontSize: font.sizeSm,
    lineHeight: 1.55,
    color: colors.textMuted,
  },
  controlsBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    flexWrap: "wrap",
  },
  fileInput: {
    width: "100%",
    maxWidth: "100%",
  },
  dropzone: {
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: space.md,
    width: "100%",
    paddingBlock: "14px",
    paddingInline: "18px",
    borderRadius: radius.lg,
    borderWidth: "1px",
    borderStyle: "dashed",
    borderColor: colors.border,
    backgroundColor: colors.bgSubtle,
    textAlign: "left",
    color: colors.textMuted,
  },
  dropzoneLead: {
    display: "flex",
    alignItems: "center",
    gap: space.md,
    minWidth: 0,
    flex: "1 1 260px",
  },
  dropzoneIcon: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "36px",
    height: "36px",
    borderRadius: radius.md,
    backgroundColor: colors.bgHover,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
    color: colors.textMuted,
    flexShrink: 0,
  },
  dropzoneTextGroup: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
    minWidth: 0,
  },
  dropzoneTitle: {
    margin: 0,
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
  },
  dropzoneHint: {
    margin: 0,
    fontSize: font.sizeXs,
    color: colors.textSubtle,
  },
  dropzoneTrigger: {
    marginTop: 0,
    height: "32px",
    paddingInline: "14px",
    flexShrink: 0,
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
    gap: space.lg,
  },
  mediaCard: {
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
  },
  previewBox: {
    height: "156px",
    width: "100%",
    backgroundColor: colors.bgSubtle,
    borderBottomWidth: "1px",
    borderBottomStyle: "solid",
    borderBottomColor: colors.borderSubtle,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    position: "relative",
  },
  previewImage: {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    display: "block",
  },
  previewFallback: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: space.xs,
    color: colors.textSubtle,
    fontSize: font.sizeXs,
  },
  cardBody: {
    display: "flex",
    flexDirection: "column",
    gap: space.sm,
    padding: space.md,
    flex: "1 1 auto",
  },
  filename: {
    margin: 0,
    fontSize: font.sizeSm,
    fontWeight: 600,
    color: colors.text,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  metaLine: {
    fontSize: font.sizeXs,
    color: colors.textMuted,
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    flexWrap: "wrap",
  },
  hashMono: {
    fontFamily: font.mono,
  },
  backlinksTrigger: {
    display: "inline-flex",
    alignItems: "center",
    gap: space.xs,
    fontSize: font.sizeXs,
    color: colors.textMuted,
    backgroundColor: "transparent",
    borderWidth: 0,
    borderStyle: "none",
    padding: 0,
    cursor: "pointer",
  },
  backlinksList: {
    display: "flex",
    flexDirection: "column",
    gap: space.xxs,
    marginTop: space.xs,
    padding: space.xs,
    borderRadius: radius.sm,
    backgroundColor: colors.bgSubtle,
    borderWidth: "1px",
    borderStyle: "solid",
    borderColor: colors.borderSubtle,
  },
  backlinkButton: {
    display: "flex",
    alignItems: "center",
    gap: space.xs,
    width: "100%",
    textAlign: "left",
    paddingBlock: space.xxs,
    paddingInline: space.xs,
    borderRadius: radius.sm,
    borderWidth: 0,
    borderStyle: "none",
    backgroundColor: {
      default: "transparent",
      ":hover": colors.bgHover,
    },
    color: colors.accent,
    fontSize: font.sizeXs,
    cursor: "pointer",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xs,
    marginTop: "auto",
    paddingTop: space.xs,
    borderTopWidth: "1px",
    borderTopStyle: "solid",
    borderTopColor: colors.borderSubtle,
  },
});

export function MediaGalleryView({
  spaces: providedSpaces,
  defaultSpaceId = null,
  onOpenNode,
  resolveNodeTitle,
}: MediaGalleryViewProps) {
  const queryClient = useQueryClient();

  const [filterMode, setFilterMode] = useState<GalleryFilterMode>("all");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(defaultSpaceId);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MediaWithRefsDto | null>(null);
  const [confirmCleanupOpen, setConfirmCleanupOpen] = useState(false);

  const spacesQuery = useQuery({
    queryKey: workspaceQueryKeys.spaces(),
    queryFn: () => fetchSpaces(),
    enabled: providedSpaces === undefined,
  });

  const spaces = providedSpaces ?? spacesQuery.data ?? [];
  const spaceNameMap = useMemo(
    () => new Map(spaces.map((item) => [item.id, item.name])),
    [spaces],
  );

  const queryFilter = useMemo(
    () => ({
      orphansOnly: filterMode === "orphans",
      spaceId: filterMode === "orphans" ? null : selectedSpaceId,
    }),
    [filterMode, selectedSpaceId],
  );

  const mediaQuery = useQuery({
    queryKey: workspaceQueryKeys.media(queryFilter),
    queryFn: () => fetchMediaList(queryFilter),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteMedia,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.media() });
      toast.success("Media asset deleted");
      setDeleteTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to delete media asset");
    },
  });

  const cleanupMutation = useMutation({
    mutationFn: async (orphanIds: string[]) => {
      for (const id of orphanIds) {
        await deleteMedia(id);
      }
      return orphanIds.length;
    },
    onSuccess: async (count) => {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.media() });
      toast.success(`Deleted ${count} orphaned media ${count === 1 ? "asset" : "assets"}`);
      setConfirmCleanupOpen(false);
    },
    onError: (err) => {
      toast.error(err instanceof Error ? err.message : "Failed to clean up orphans");
    },
  });

  const handleUploadFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setUploadingCount((prev) => prev + files.length);
    let successCount = 0;

    for (const file of files) {
      try {
        await uploadMediaFile(file, { spaceId: selectedSpaceId });
        successCount += 1;
      } catch (err) {
        toast.error(
          `Upload failed for "${file.name}": ${err instanceof Error ? err.message : "Unknown error"}`,
        );
      }
    }

    setUploadingCount((prev) => Math.max(0, prev - files.length));
    setQueuedFiles([]);

    if (successCount > 0) {
      await queryClient.invalidateQueries({ queryKey: workspaceQueryKeys.media() });
      toast.success(`Uploaded ${successCount} ${successCount === 1 ? "file" : "files"}`);
    }
  };

  const handleCopyUrl = async (item: MediaWithRefsDto) => {
    const mediaPath = item.url || API_ROUTES.mediaById(item.id);
    try {
      await navigator.clipboard.writeText(mediaPath);
      setCopiedId(item.id);
      toast.success(`Copied ${mediaPath}`);
      setTimeout(() => {
        setCopiedId((prev) => (prev === item.id ? null : prev));
      }, 1500);
    } catch {
      toast.error("Unable to copy URL to clipboard");
    }
  };

  const items = mediaQuery.data ?? [];
  const orphanItems = useMemo(() => items.filter((item) => item.refCount === 0), [items]);
  const selectedSpaceLabel = selectedSpaceId
    ? (spaceNameMap.get(selectedSpaceId) ?? "Selected Space")
    : "All Spaces";

  return (
    <section data-slot="merak-media-gallery" {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.header)}>
        <div>
          <h1 {...stylex.props(styles.title)}>Media Gallery</h1>
          <p {...stylex.props(styles.subtitle)}>
            SHA-256 deduplicated workspace images and files with live document backlinks and orphan
            cleanup.
          </p>
        </div>

        {orphanItems.length > 0 ? (
          <Button
            data-variant="destructive"
            onClick={() => setConfirmCleanupOpen(true)}
            disabled={cleanupMutation.isPending}
          >
            <Trash2 size={14} />
            <span>Clean Up Orphans ({orphanItems.length})</span>
          </Button>
        ) : null}
      </div>

      <div {...stylex.props(styles.controlsBar)}>
        <Inline gap="sm" wrap>
          <SegmentedControl<GalleryFilterMode>
            value={filterMode}
            onValueChange={(next) => {
              if (next === "all" || next === "orphans") {
                setFilterMode(next);
              }
            }}
          >
            <SegmentedControlIndicator />
            <SegmentedControlItem value="all">All Media</SegmentedControlItem>
            <SegmentedControlItem value="orphans">Orphans Only</SegmentedControlItem>
          </SegmentedControl>

          {filterMode === "all" ? (
            <Menu>
              <MenuTrigger>
                <Filter size={14} />
                <span>{selectedSpaceLabel}</span>
                <ChevronDown size={14} />
              </MenuTrigger>
              <MenuContent align="start">
                <MenuGroup>
                  <MenuGroupLabel>Filter by Space</MenuGroupLabel>
                  <MenuItem
                    value="space:all"
                    onSelect={() => setSelectedSpaceId(null)}
                  >
                    All Spaces
                  </MenuItem>
                  {spaces.length > 0 ? <MenuSeparator /> : null}
                  {spaces.map((item) => (
                    <MenuItem
                      key={item.id}
                      value={`space:${item.id}`}
                      onSelect={() => setSelectedSpaceId(item.id)}
                    >
                      {item.name}
                    </MenuItem>
                  ))}
                </MenuGroup>
              </MenuContent>
            </Menu>
          ) : null}
        </Inline>

        <Badge tone="neutral">
          {items.length} {items.length === 1 ? "asset" : "assets"}
        </Badge>
      </div>

      <FileInput
        multiple
        value={queuedFiles}
        disabled={uploadingCount > 0}
        onValueChange={(nextFiles, details) => {
          setQueuedFiles(nextFiles);
          if (details.added.length > 0) {
            void handleUploadFiles(details.added);
          }
        }}
        {...stylex.props(styles.fileInput)}
      >
        <FileInputDropzone {...stylex.props(styles.dropzone)}>
          <div {...stylex.props(styles.dropzoneLead)}>
            <div {...stylex.props(styles.dropzoneIcon)}>
              <UploadCloud size={18} />
            </div>
            <div {...stylex.props(styles.dropzoneTextGroup)}>
              <p {...stylex.props(styles.dropzoneTitle)}>
                {uploadingCount > 0
                  ? `Uploading ${uploadingCount} ${uploadingCount === 1 ? "file" : "files"}...`
                  : "Drag and drop files here, or paste from clipboard"}
              </p>
              <p {...stylex.props(styles.dropzoneHint)}>
                {selectedSpaceId
                  ? `Uploads will be tagged to "${selectedSpaceLabel}" and deduplicated by SHA-256.`
                  : "Uploads are stored once per organization and deduplicated by SHA-256."}
              </p>
            </div>
          </div>
          <FileInputTrigger {...stylex.props(styles.dropzoneTrigger)}>
            <span>Choose Files</span>
          </FileInputTrigger>
        </FileInputDropzone>
      </FileInput>

      {mediaQuery.isLoading ? (
        <Card padding="md" variant="subtle">
          Loading media gallery...
        </Card>
      ) : mediaQuery.isError ? (
        <Card padding="md" variant="subtle">
          {mediaQuery.error instanceof Error
            ? mediaQuery.error.message
            : "Failed to load media gallery."}
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<ImageIcon size={22} />}
          title={filterMode === "orphans" ? "No orphaned media" : "No media assets yet"}
          description={
            filterMode === "orphans"
              ? "Every uploaded media asset is currently referenced by at least one document or canvas."
              : "Drop images or files above to upload them to your workspace Media Gallery."
          }
        />
      ) : (
        <div {...stylex.props(styles.grid)}>
          {items.map((item) => {
            const isImage = item.mimeType.startsWith("image/");
            const isOrphan = item.refCount === 0;
            const mediaUrl = item.url || API_ROUTES.mediaById(item.id);
            const spaceLabel = item.spaceId ? spaceNameMap.get(item.spaceId) : null;

            return (
              <Card key={item.id} padding="none" variant="elevated" xstyle={styles.mediaCard}>
                <div {...stylex.props(styles.previewBox)}>
                  {isImage ? (
                    <img
                      src={mediaUrl}
                      alt={item.filename}
                      loading="lazy"
                      {...stylex.props(styles.previewImage)}
                    />
                  ) : (
                    <div {...stylex.props(styles.previewFallback)}>
                      <FileIcon size={28} />
                      <span>{item.mimeType}</span>
                    </div>
                  )}
                </div>

                <div {...stylex.props(styles.cardBody)}>
                  <p title={item.filename} {...stylex.props(styles.filename)}>
                    {item.filename}
                  </p>

                  <div {...stylex.props(styles.metaLine)}>
                    <span>{formatBytes(item.sizeBytes)}</span>
                    {item.width && item.height ? (
                      <span>
                        · {item.width} × {item.height}
                      </span>
                    ) : null}
                    {spaceLabel ? <span>· {spaceLabel}</span> : null}
                  </div>

                  <Inline gap="xs" wrap>
                    <Badge tone="neutral">
                      <span {...stylex.props(styles.hashMono)}>#{shortHash(item.sha256, 8)}</span>
                    </Badge>
                    <Badge tone={isOrphan ? "warning" : "accent"}>
                      <Link2 size={11} />
                      <span>
                        {isOrphan
                          ? "Orphan"
                          : `${item.refCount} ${item.refCount === 1 ? "ref" : "refs"}`}
                      </span>
                    </Badge>
                  </Inline>

                  {item.refNodeIds.length > 0 ? (
                    <Collapsible>
                      <CollapsibleTrigger {...stylex.props(styles.backlinksTrigger)}>
                        <ChevronDown size={12} />
                        <span>View backlinks ({item.refNodeIds.length})</span>
                      </CollapsibleTrigger>
                      <CollapsiblePanel>
                        <div {...stylex.props(styles.backlinksList)}>
                          {item.refNodeIds.map((nodeId) => (
                            <button
                              key={nodeId}
                              type="button"
                              onClick={() => onOpenNode?.(nodeId)}
                              {...stylex.props(styles.backlinkButton)}
                            >
                              <FileText size={12} />
                              <span>{resolveNodeTitle?.(nodeId) ?? nodeId}</span>
                            </button>
                          ))}
                        </div>
                      </CollapsiblePanel>
                    </Collapsible>
                  ) : null}

                  <div {...stylex.props(styles.cardFooter)}>
                    <Button onClick={() => void handleCopyUrl(item)}>
                      {copiedId === item.id ? <Check size={13} /> : <Copy size={13} />}
                      <span>{copiedId === item.id ? "Copied" : "Copy URL"}</span>
                    </Button>

                    {isOrphan ? (
                      <Button
                        data-variant="destructive"
                        onClick={() => setDeleteTarget(item)}
                      >
                        <Trash2 size={13} />
                        <span>Delete</span>
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setDeleteTarget(null);
        }}
      >
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogTitle>Delete Media Asset?</AlertDialogTitle>
          <AlertDialogDescription>
            {deleteTarget
              ? `"${deleteTarget.filename}" has no active references and will be permanently removed.`
              : "This media asset will be permanently removed."}
          </AlertDialogDescription>
          <Inline justify="end" gap="sm">
            <AlertDialogClose disabled={deleteMutation.isPending}>Cancel</AlertDialogClose>
            <Button
              data-variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => {
                if (deleteTarget) {
                  deleteMutation.mutate(deleteTarget.id);
                }
              }}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete Asset"}
            </Button>
          </Inline>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmCleanupOpen} onOpenChange={setConfirmCleanupOpen}>
        <AlertDialogBackdrop />
        <AlertDialogContent>
          <AlertDialogTitle>Clean Up Orphaned Media?</AlertDialogTitle>
          <AlertDialogDescription>
            Permanently delete {orphanItems.length} unreferenced media{" "}
            {orphanItems.length === 1 ? "asset" : "assets"} currently shown in the gallery?
          </AlertDialogDescription>
          <Inline justify="end" gap="sm">
            <AlertDialogClose disabled={cleanupMutation.isPending}>Cancel</AlertDialogClose>
            <Button
              data-variant="destructive"
              disabled={cleanupMutation.isPending}
              onClick={() => {
                cleanupMutation.mutate(orphanItems.map((item) => item.id));
              }}
            >
              {cleanupMutation.isPending ? "Cleaning up..." : "Delete Orphans"}
            </Button>
          </Inline>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
