import type { MediaDto } from "../schemas/media.js";
import type { NodeDetailDto, NodeType } from "../schemas/node.js";

export interface AssetEditorProps {
  node: NodeDetailDto;
  readOnly?: boolean;
  theme: "light" | "dark";
  onChange: (nextContent: string) => void;
  onSave?: (nextContent: string) => Promise<void>;
  onUploadMedia: (file: File) => Promise<MediaDto>;
  onCreateChild: (input: {
    type: NodeType;
    title: string;
    content?: string;
  }) => Promise<NodeDetailDto>;
  onOpenNode: (nodeId: string) => void;
  resolveNode?: (nodeId: string) => Promise<NodeDetailDto | null>;
}
