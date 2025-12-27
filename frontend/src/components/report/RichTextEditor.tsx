import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Highlight from '@tiptap/extension-highlight';
import { cn } from '@/lib/utils';
import {
    Bold, Italic, Underline as UnderlineIcon, Strikethrough,
    List, ListOrdered, Quote, Code, Heading1, Heading2, Heading3,
    AlignLeft, AlignCenter, AlignRight, AlignJustify,
    Highlighter, Undo, Redo, Minus
} from 'lucide-react';


interface RichTextEditorProps {
    content: string;
    onChange: (content: string) => void;
    placeholder?: string;
    className?: string;
    editable?: boolean;
    minHeight?: string;
}

interface ToolbarButtonProps {
    onClick: () => void;
    isActive?: boolean;
    disabled?: boolean;
    title: string;
    children: React.ReactNode;
}

const ToolbarButton = ({ onClick, isActive, disabled, title, children }: ToolbarButtonProps) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        title={title}
        className={cn(
            "p-2 rounded-md transition-all duration-150",
            "hover:bg-ocean-100 dark:hover:bg-ocean-900/30",
            "disabled:opacity-50 disabled:cursor-not-allowed",
            isActive
                ? "bg-ocean-100 dark:bg-ocean-900/40 text-ocean-600 dark:text-ocean-400"
                : "text-deep-600 dark:text-gray-400"
        )}
    >
        {children}
    </button>
);

const ToolbarDivider = () => (
    <div className="w-px h-6 bg-gray-300 dark:bg-gray-600 mx-1" />
);

export default function RichTextEditor({
    content,
    onChange,
    placeholder = "Start writing your content...",
    className,
    editable = true,
    minHeight = "200px"
}: RichTextEditorProps) {
    const editor = useEditor({
        extensions: [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3],
                },
            }),
            Placeholder.configure({
                placeholder,
                emptyEditorClass: 'is-editor-empty',
            }),
            Underline,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Highlight.configure({
                multicolor: true,
            }),
        ],
        content,
        editable,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: cn(
                    "prose prose-sm dark:prose-invert max-w-none",
                    "focus:outline-none",
                    "min-h-[200px] p-4"
                ),
                style: `min-height: ${minHeight}`,
            },
        },
    });

    if (!editor) {
        return null;
    }

    return (
        <div className={cn("border rounded-lg overflow-hidden bg-white dark:bg-deep-800", className)}>
            {/* Toolbar */}
            <div className="flex flex-wrap items-center gap-0.5 p-2 border-b bg-gray-50 dark:bg-deep-900/50">
                {/* Undo/Redo */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().undo().run()}
                    disabled={!editor.can().undo()}
                    title="Undo (Ctrl+Z)"
                >
                    <Undo className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().redo().run()}
                    disabled={!editor.can().redo()}
                    title="Redo (Ctrl+Shift+Z)"
                >
                    <Redo className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Text Formatting */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBold().run()}
                    isActive={editor.isActive('bold')}
                    title="Bold (Ctrl+B)"
                >
                    <Bold className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleItalic().run()}
                    isActive={editor.isActive('italic')}
                    title="Italic (Ctrl+I)"
                >
                    <Italic className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleUnderline().run()}
                    isActive={editor.isActive('underline')}
                    title="Underline (Ctrl+U)"
                >
                    <UnderlineIcon className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleStrike().run()}
                    isActive={editor.isActive('strike')}
                    title="Strikethrough"
                >
                    <Strikethrough className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHighlight().run()}
                    isActive={editor.isActive('highlight')}
                    title="Highlight"
                >
                    <Highlighter className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleCode().run()}
                    isActive={editor.isActive('code')}
                    title="Inline Code"
                >
                    <Code className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Headings */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
                    isActive={editor.isActive('heading', { level: 1 })}
                    title="Heading 1"
                >
                    <Heading1 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
                    isActive={editor.isActive('heading', { level: 2 })}
                    title="Heading 2"
                >
                    <Heading2 className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
                    isActive={editor.isActive('heading', { level: 3 })}
                    title="Heading 3"
                >
                    <Heading3 className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Lists */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBulletList().run()}
                    isActive={editor.isActive('bulletList')}
                    title="Bullet List"
                >
                    <List className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    isActive={editor.isActive('orderedList')}
                    title="Numbered List"
                >
                    <ListOrdered className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().toggleBlockquote().run()}
                    isActive={editor.isActive('blockquote')}
                    title="Blockquote"
                >
                    <Quote className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    title="Horizontal Rule"
                >
                    <Minus className="w-4 h-4" />
                </ToolbarButton>

                <ToolbarDivider />

                {/* Text Alignment */}
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    isActive={editor.isActive({ textAlign: 'left' })}
                    title="Align Left"
                >
                    <AlignLeft className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    isActive={editor.isActive({ textAlign: 'center' })}
                    title="Align Center"
                >
                    <AlignCenter className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    isActive={editor.isActive({ textAlign: 'right' })}
                    title="Align Right"
                >
                    <AlignRight className="w-4 h-4" />
                </ToolbarButton>
                <ToolbarButton
                    onClick={() => editor.chain().focus().setTextAlign('justify').run()}
                    isActive={editor.isActive({ textAlign: 'justify' })}
                    title="Justify"
                >
                    <AlignJustify className="w-4 h-4" />
                </ToolbarButton>
            </div>

            {/* Editor Content */}
            <EditorContent editor={editor} />

            {/* Editor Styles */}
            <style>{`
        .is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #9ca3af;
          pointer-events: none;
          height: 0;
        }
        
        .ProseMirror {
          outline: none;
        }
        
        .ProseMirror h1 {
          font-size: 1.875rem;
          font-weight: 700;
          margin-bottom: 0.5rem;
        }
        
        .ProseMirror h2 {
          font-size: 1.5rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        
        .ProseMirror h3 {
          font-size: 1.25rem;
          font-weight: 600;
          margin-bottom: 0.5rem;
        }
        
        .ProseMirror ul, .ProseMirror ol {
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        
        .ProseMirror blockquote {
          border-left: 3px solid #0ea5e9;
          padding-left: 1rem;
          margin: 1rem 0;
          color: #6b7280;
          font-style: italic;
        }
        
        .ProseMirror code {
          background-color: #f3f4f6;
          padding: 0.125rem 0.375rem;
          border-radius: 0.25rem;
          font-family: monospace;
          font-size: 0.875em;
        }
        
        .dark .ProseMirror code {
          background-color: #374151;
        }
        
        .ProseMirror mark {
          background-color: #fef08a;
          padding: 0.125rem 0;
        }
        
        .ProseMirror hr {
          border: none;
          border-top: 2px solid #e5e7eb;
          margin: 1.5rem 0;
        }
        
        .dark .ProseMirror hr {
          border-top-color: #4b5563;
        }
        
        .ProseMirror p {
          margin: 0.5rem 0;
        }
      `}</style>
        </div>
    );
}
