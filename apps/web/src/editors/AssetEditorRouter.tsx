import type { AssetEditorProps } from "@merak/shared";
import { CanvasEditor } from "./CanvasEditor.js";
import { ExcalidrawEditor } from "./ExcalidrawEditor.js";
import { HtmlArtifactEditor } from "./HtmlArtifactEditor.js";
import { MarkdownEditor } from "./MarkdownEditor.js";

export function AssetEditorRouter(props: AssetEditorProps) {
  switch (props.node.type) {
    case "doc":
      return <MarkdownEditor {...props} />;
    case "excalidraw":
      return <ExcalidrawEditor {...props} />;
    case "html":
      return <HtmlArtifactEditor {...props} />;
    case "canvas":
      return <CanvasEditor {...props} />;
  }
}
