import {
  StrictMode,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import QRCode from "qrcode";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import "./styles.css";

/**
 * Aurel — QR atelier.
 *
 * Whole app in one file, in this order:
 *   1. helpers, types & templates   2. QR drawing engine (canvas)
 *   3. studio state (localStorage)  4. tiny hash router (GitHub Pages safe)
 *   5. icons & shared UI            6. pages   7. boot
 */

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// ---- icons (same shapes as lucide, inlined so no icon package is needed) ----
function Icon({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}
const ArrowUpRight = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M7 7h10v10" />
    <path d="M7 17 17 7" />
  </Icon>
);
const Link2 = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M9 17H7A5 5 0 0 1 7 7h2" />
    <path d="M15 7h2a5 5 0 1 1 0 10h-2" />
    <line x1="8" x2="16" y1="12" y2="12" />
  </Icon>
);
const Download = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" x2="12" y1="15" y2="3" />
  </Icon>
);
const ImagePlus = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M16 5h6" />
    <path d="M19 2v6" />
    <path d="M21 11.5V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7.5" />
    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    <circle cx="9" cy="9" r="2" />
  </Icon>
);
const X = ({ className }: { className?: string }) => (
  <Icon className={className}>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Icon>
);

// ==========================================================================
// 1. Helpers, types & templates
// ==========================================================================

// ---- types ----
type ModuleShape = "square" | "rounded" | "dot" | "squircle" | "diamond";
type EyeShape = "square" | "rounded" | "circle" | "leaf";
type MarkKind = "none" | "instagram" | "facebook" | "whatsapp" | "web" | "upload";
type GroundMode = "off" | "small" | "center" | "full";
type CaptionFont = "serif" | "sans";
type LookCategory =
  | "Atelier"
  | "Editorial"
  | "Cafe"
  | "Wellness"
  | "Coast"
  | "Night"
  | "Ceremony"
  | "Signal";

type Design = {
  data: string;
  fg: string;
  bg: string;
  module: ModuleShape;
  eye: EyeShape;
  size: number;
  quiet: number;
  mark: MarkKind;
  markDataUrl: string | null;
  markScale: number;
  ground: GroundMode;
  groundDataUrl: string | null;
  caption: string;
  captionSub: string;
  captionBold: boolean;
  captionItalic: boolean;
  captionCaps: boolean;
  captionFont: CaptionFont;
  showCaption: boolean;
  paletteId: string | null;
  templateId: string | null;
};

const defaultDesign: Design = {
  data: "https://aurel.studio",
  fg: "#3E3239",
  bg: "#F7EFE7",
  module: "rounded",
  eye: "rounded",
  size: 360,
  quiet: 4,
  mark: "none",
  markDataUrl: null,
  markScale: 0.22,
  ground: "off",
  groundDataUrl: null,
  caption: "Scan to enter",
  captionSub: "Aurel atelier",
  captionBold: true,
  captionItalic: false,
  captionCaps: false,
  captionFont: "serif",
  showCaption: true,
  paletteId: "pressed-card",
  templateId: null,
};

// ---- link / text normalising ----
function normalizeTarget(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  if (/^(https?:|mailto:|tel:)/i.test(t)) return t;
  if (/^[\w.+-]+@[\w.-]+\.[a-z]{2,}$/i.test(t)) return `mailto:${t}`;
  if (/^[+]?[\d][\d\s().-]{6,}$/.test(t)) return `tel:${t.replace(/[^\d+]/g, "")}`;
  if (/^[\w.-]+\.[a-z]{2,}([/:?#].*)?$/i.test(t)) return `https://${t}`;
  return t;
}

// ---- 56 templates ----

type Look = {
  id: string;
  palette: string;
  name: string;
  category: LookCategory;
  fg: string;
  bg: string;
  module: ModuleShape;
  eye: EyeShape;
  caption: string;
  sub: string;
  bold: boolean;
  italic: boolean;
  font: CaptionFont;
};

type Row = [
  id: string,
  palette: string,
  name: string,
  category: LookCategory,
  fg: string,
  bg: string,
  module: ModuleShape,
  eye: EyeShape,
  caption: string,
  sub: string,
  bold: 0 | 1,
  italic: 0 | 1,
  font: CaptionFont,
];

const ROWS: Row[] = [
  ["pressed-card", "Ink Rose", "Pressed Card", "Atelier", "#3E3239", "#F7EFE7", "rounded", "rounded", "The private view", "Thursday, after six", 1, 1, "serif"],
  ["milk-glass", "Dust Veil", "Milk Glass", "Atelier", "#3E3239", "#E8D2C4", "squircle", "leaf", "Soft launch", "By invitation", 1, 0, "serif"],
  ["cocoa-note", "Cocoa Milk", "Cocoa Note", "Atelier", "#3A2A24", "#F6EDE4", "square", "square", "Table four", "Hold until nine", 1, 0, "sans"],
  ["plum-editorial", "Plum Paper", "Plum Editorial", "Atelier", "#3F2C38", "#F4E4DC", "rounded", "circle", "Issue 04", "Printed in rose", 1, 1, "serif"],
  ["night-bloom", "Night Bloom", "Night Bloom", "Atelier", "#F7EFE7", "#3E3239", "dot", "circle", "After dark", "Doors at ten", 1, 0, "serif"],
  ["velvet-room", "Velvet", "Velvet Room", "Atelier", "#F3E4DC", "#2A2226", "squircle", "rounded", "Members", "Show this mark", 1, 0, "sans"],
  ["wine-hour", "Wine Hour", "Wine Hour", "Atelier", "#F7EFE7", "#4A2430", "rounded", "leaf", "Last seating", "Kitchen closes", 1, 1, "serif"],

  ["carbon-proof", "Carbon", "Carbon Proof", "Editorial", "#1A1A1A", "#F4F1EC", "square", "square", "Read the piece", "No. 18", 1, 0, "sans"],
  ["sunday-paper", "Newsprint", "Sunday Paper", "Editorial", "#22201C", "#E7E2D8", "rounded", "square", "The interview", "This weekend", 1, 0, "serif"],
  ["white-wall", "Gallery", "White Wall", "Editorial", "#141414", "#FFFFFF", "square", "rounded", "Now showing", "North room", 1, 0, "sans"],
  ["night-proof", "Graphite", "Night Proof", "Editorial", "#F2F0EB", "#1C1C1C", "dot", "circle", "Black edition", "Limited run", 1, 0, "sans"],
  ["margin-notes", "Slate", "Margin Notes", "Editorial", "#1E2933", "#E8EEF2", "rounded", "rounded", "Field notes", "Volume two", 0, 1, "serif"],
  ["warm-charcoal", "Charcoal", "Warm Charcoal", "Editorial", "#2C2825", "#F3EEE6", "squircle", "leaf", "Studio visit", "By appointment", 1, 0, "serif"],
  ["the-index", "Index", "The Index", "Editorial", "#1A1614", "#F7F4EF", "square", "square", "Contents", "Start here", 1, 0, "sans"],

  ["espresso-card", "Espresso", "Espresso Card", "Cafe", "#2B1B14", "#F3E6D4", "rounded", "rounded", "Order ahead", "Bar opens at 8", 1, 0, "serif"],
  ["morning-latte", "Latte", "Morning Latte", "Cafe", "#3D2918", "#F8F1E7", "squircle", "circle", "The daily", "Single origin", 1, 0, "serif"],
  ["mocha-night", "Mocha", "Mocha Night", "Cafe", "#F6E8D8", "#3C2A22", "dot", "rounded", "Dessert menu", "After four", 1, 0, "sans"],
  ["honey-jar", "Honey", "Honey Jar", "Cafe", "#3A2A10", "#F8F0D8", "rounded", "leaf", "Sunday bake", "Until sold out", 1, 1, "serif"],
  ["olive-branch", "Olive", "Olive Branch", "Cafe", "#2E3420", "#F3F0E4", "square", "square", "Lunch, set", "Twelve to three", 1, 0, "sans"],
  ["clay-cup", "Terracotta", "Clay Cup", "Cafe", "#5A2C1C", "#F8EDE3", "squircle", "rounded", "House blend", "Ask the bar", 1, 0, "serif"],
  ["last-cup", "Cocoa Dark", "Last Cup", "Cafe", "#F6EDE4", "#2A1C16", "rounded", "circle", "Closed kitchen", "Tomorrow at 8", 1, 0, "serif"],

  ["sage-room", "Sage", "Sage Room", "Wellness", "#243028", "#E7F0E6", "rounded", "circle", "Book an hour", "Quiet floor", 1, 0, "serif"],
  ["moss-light", "Moss", "Moss Light", "Wellness", "#E8F2E4", "#24332A", "dot", "circle", "Dawn class", "Bring water", 1, 0, "sans"],
  ["still-water", "Spa", "Still Water", "Wellness", "#1F3A38", "#E5F2EF", "squircle", "rounded", "The treatment", "Arrive early", 1, 0, "serif"],
  ["green-rest", "Eucalyptus", "Green Rest", "Wellness", "#1E3330", "#E4EFE8", "rounded", "leaf", "Breathwork", "Small group", 0, 1, "serif"],
  ["warm-clay", "Clay", "Warm Clay", "Wellness", "#5C3A32", "#F6EBE4", "square", "rounded", "Slow morning", "Phones aside", 1, 0, "serif"],
  ["soft-blossom", "Blossom", "Soft Blossom", "Wellness", "#3E3239", "#F3E7E4", "squircle", "circle", "Facial, forty-five", "Book below", 1, 0, "sans"],
  ["deep-forest", "Forest", "Deep Forest", "Wellness", "#E7F3EA", "#1A2C22", "rounded", "rounded", "Trail map", "Start at the gate", 1, 0, "sans"],

  ["harbor-light", "Navy", "Harbor Light", "Coast", "#10243F", "#E7EEF6", "square", "square", "Boarding", "Slip four", 1, 0, "sans"],
  ["night-tide", "Tide", "Night Tide", "Coast", "#E8F1F8", "#0E2438", "dot", "circle", "Last ferry", "Nine forty", 1, 0, "sans"],
  ["sea-glass", "Sea Glass", "Sea Glass", "Coast", "#12343A", "#E5F3F1", "rounded", "rounded", "The coast list", "Summer", 1, 1, "serif"],
  ["sandbar", "Sandbar", "Sandbar", "Coast", "#243044", "#F4EFE6", "squircle", "leaf", "Rooms left", "Ocean side", 1, 0, "serif"],
  ["dark-harbor", "Harbor", "Dark Harbor", "Coast", "#F2F6F8", "#163044", "rounded", "circle", "Chart a course", "Tap to open", 1, 0, "sans"],
  ["shell-white", "Shell", "Shell White", "Coast", "#3A2E2A", "#F7F1EA", "rounded", "rounded", "Low tide", "Walk with us", 0, 1, "serif"],
  ["atlantic", "Atlantic", "Atlantic", "Coast", "#0E1C2C", "#E6EEF4", "square", "square", "Regatta", "Saturday", 1, 0, "sans"],

  ["obsidian", "Obsidian", "Obsidian", "Night", "#F5F2EE", "#0E0E10", "square", "square", "Guest list", "Name at the door", 1, 0, "sans"],
  ["midnight-ink", "Midnight", "Midnight Ink", "Night", "#E8E4F2", "#12141C", "dot", "circle", "Set times", "Room two", 1, 0, "sans"],
  ["rose-after", "Rose Dark", "Rose After", "Night", "#F7EFE7", "#1A1216", "squircle", "leaf", "Encore", "One more hour", 1, 1, "serif"],
  ["emerald-night", "Emerald", "Emerald Night", "Night", "#E7F6EC", "#0E1F18", "rounded", "circle", "Listening bar", "No photos, please", 1, 0, "serif"],
  ["cobalt-room", "Cobalt", "Cobalt Room", "Night", "#EAF0FF", "#10182E", "dot", "rounded", "Late set", "Starts at eleven", 1, 0, "sans"],
  ["amber-dark", "Amber", "Amber Dark", "Night", "#F8E7C4", "#1A140C", "squircle", "leaf", "Whisky list", "Ask upstairs", 1, 0, "serif"],
  ["black-tie", "Black Tie", "Black Tie", "Night", "#F7F4EF", "#111111", "square", "square", "You are expected", "Formal", 1, 0, "serif"],

  ["ivory-vow", "Ivory", "Ivory Vow", "Ceremony", "#2C2420", "#FBF7F2", "rounded", "rounded", "Our day", "Scan for the details", 1, 1, "serif"],
  ["champagne", "Champagne", "Champagne", "Ceremony", "#3A2C24", "#F6EBD9", "squircle", "leaf", "To the couple", "Table plan", 1, 0, "serif"],
  ["blush-vow", "Blush", "Blush Vow", "Ceremony", "#4A3040", "#F8E8EA", "rounded", "circle", "Save the date", "June the twelfth", 1, 1, "serif"],
  ["gold-line", "Gold", "Gold Line", "Ceremony", "#3A2E18", "#F8F1DE", "square", "square", "The reception", "Dancing after", 1, 0, "serif"],
  ["pearl", "Pearl", "Pearl", "Ceremony", "#2A2628", "#F4F0F2", "squircle", "rounded", "Kindly reply", "By the first", 0, 1, "serif"],
  ["garden-party", "Garden", "Garden Party", "Ceremony", "#243028", "#F3F6EF", "rounded", "leaf", "In the garden", "Four o'clock", 1, 0, "serif"],
  ["dusk-vow", "Dusk", "Dusk Vow", "Ceremony", "#F6EEE8", "#3A2A32", "dot", "circle", "Evening vows", "Under the lights", 1, 1, "serif"],

  ["signal-blue", "Klein", "Signal Blue", "Signal", "#0C2F8A", "#E8EEF8", "square", "square", "Open the work", "Case study", 1, 0, "sans"],
  ["pine-signal", "Pine", "Pine Signal", "Signal", "#143024", "#E6F0E4", "rounded", "rounded", "Download", "The deck", 1, 0, "sans"],
  ["indigo-note", "Indigo", "Indigo Note", "Signal", "#1E1B4B", "#EEEAF6", "squircle", "circle", "Join the call", "Link inside", 1, 0, "sans"],
  ["copperplate", "Copper", "Copperplate", "Signal", "#6B3418", "#F8EDE3", "square", "leaf", "The lookbook", "Spring", 1, 0, "serif"],
  ["bone-paper", "Bone", "Bone Paper", "Signal", "#1F1A17", "#EFEAE2", "rounded", "square", "Portfolio", "Selected work", 1, 0, "sans"],
  ["lilac-ink", "Lilac", "Lilac Ink", "Signal", "#2A2438", "#F3EEF6", "dot", "circle", "New essay", "Twelve minutes", 0, 1, "serif"],
  ["crimson-seal", "Crimson", "Crimson Seal", "Signal", "#F8E8E6", "#3A1218", "squircle", "rounded", "Limited drop", "Tonight only", 1, 0, "sans"],
];

function rowToLook(row: Row): Look {
  const [id, palette, name, category, fg, bg, module, eye, caption, sub, bold, italic, font] = row;
  return { id, palette, name, category, fg, bg, module, eye, caption, sub, bold: bold === 1, italic: italic === 1, font };
}

const LOOKS: Look[] = ROWS.map(rowToLook);

const CATEGORIES: LookCategory[] = [
  "Atelier",
  "Editorial",
  "Cafe",
  "Wellness",
  "Coast",
  "Night",
  "Ceremony",
  "Signal",
];

function designFromLook(look: Look, data = defaultDesign.data, withCaption = false): Design {
  return {
    ...defaultDesign,
    data,
    fg: look.fg,
    bg: look.bg,
    module: look.module,
    eye: look.eye,
    caption: look.caption,
    captionSub: look.sub,
    captionBold: look.bold,
    captionItalic: look.italic,
    captionFont: look.font,
    captionCaps: false,
    showCaption: withCaption,
    paletteId: look.id,
    templateId: look.id,
    mark: "none",
    ground: "off",
    size: withCaption ? defaultDesign.size : 280,
  };
}

// ---- image upload shrinker ----
function shrinkImage(file: File, max = 960): Promise<string> {
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("Could not read that picture."));
        return;
      }
      if (mime === "image/jpeg") {
        ctx.fillStyle = "#F7EFE7";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL(mime, 0.88));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that picture."));
    };
    img.src = url;
  });
}

// ==========================================================================
// 2. QR drawing engine (canvas)
// ==========================================================================


type RenderInfo = {
  note: string;
  warn: boolean;
};

const FONT_READY = () =>
  typeof document !== "undefined" && document.fonts
    ? Promise.all([
        document.fonts.load("600 64px Fraunces"),
        document.fonts.load("italic 600 64px Fraunces"),
        document.fonts.load("500 32px Outfit"),
        document.fonts.load("700 48px Outfit"),
      ]).then(() => undefined)
    : Promise.resolve();

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Could not draw that picture."));
    img.src = src;
  });
}

function channel(hex: string, i: number) {
  const h = hex.replace("#", "");
  return parseInt(h.slice(i, i + 2), 16);
}

function hexAlpha(hex: string, alpha: number) {
  return `rgba(${channel(hex, 0)}, ${channel(hex, 2)}, ${channel(hex, 4)}, ${alpha})`;
}

function lin(c: number) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string) {
  return 0.2126 * lin(channel(hex, 0)) + 0.7152 * lin(channel(hex, 2)) + 0.0722 * lin(channel(hex, 4));
}

function contrastRatio(a: string, b: string) {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

function traceRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number],
) {
  const [tl0, tr0, br0, bl0] = typeof r === "number" ? [r, r, r, r] : r;
  const tl = Math.max(0, Math.min(tl0, w / 2, h / 2));
  const tr = Math.max(0, Math.min(tr0, w / 2, h / 2));
  const br = Math.max(0, Math.min(br0, w / 2, h / 2));
  const bl = Math.max(0, Math.min(bl0, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + tl, y);
  ctx.lineTo(x + w - tr, y);
  if (tr) ctx.quadraticCurveTo(x + w, y, x + w, y + tr);
  else ctx.lineTo(x + w, y);
  ctx.lineTo(x + w, y + h - br);
  if (br) ctx.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
  else ctx.lineTo(x + w, y + h);
  ctx.lineTo(x + bl, y + h);
  if (bl) ctx.quadraticCurveTo(x, y + h, x, y + h - bl);
  else ctx.lineTo(x, y + h);
  ctx.lineTo(x, y + tl);
  if (tl) ctx.quadraticCurveTo(x, y, x + tl, y);
  else ctx.lineTo(x, y);
  ctx.closePath();
}

function fillRound(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | [number, number, number, number],
  color: string,
) {
  traceRound(ctx, x, y, w, h, r);
  ctx.fillStyle = color;
  ctx.fill();
}

function cover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  w: number,
  h: number,
) {
  const ir = img.width / img.height;
  const r = w / h;
  let sx = 0;
  let sy = 0;
  let sw = img.width;
  let sh = img.height;
  if (ir > r) {
    sw = img.height * r;
    sx = (img.width - sw) / 2;
  } else {
    sh = img.width / r;
    sy = (img.height - sh) / 2;
  }
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

const ALIGN: number[][] = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
  [6, 28, 50, 72, 94],
  [6, 26, 50, 74, 98],
  [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106],
  [6, 32, 58, 84, 110],
  [6, 30, 58, 86, 114],
  [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122],
  [6, 30, 54, 78, 102, 126],
  [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134],
  [6, 34, 60, 86, 112, 138],
  [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146],
  [6, 30, 54, 78, 102, 126, 150],
  [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158],
  [6, 32, 58, 84, 110, 136, 162],
  [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
];

function finderOrigin(row: number, col: number, n: number) {
  if (row < 7 && col < 7) return { r0: 0, c0: 0 };
  if (row < 7 && col >= n - 7) return { r0: 0, c0: n - 7 };
  if (row >= n - 7 && col < 7) return { r0: n - 7, c0: 0 };
  return null;
}

function inAlignment(row: number, col: number, version: number, n: number) {
  const centers = ALIGN[version - 1] ?? [];
  for (const r of centers) {
    for (const c of centers) {
      if (finderOrigin(r, c, n)) continue;
      if (Math.abs(row - r) <= 2 && Math.abs(col - c) <= 2) return true;
    }
  }
  return false;
}

function keepSolid(row: number, col: number, version: number, n: number) {
  if (row === 6 || col === 6) return true;
  return inAlignment(row, col, version, n);
}

function drawModule(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  shape: ModuleShape,
  north: boolean,
  east: boolean,
  south: boolean,
  west: boolean,
) {
  if (shape === "square") {
    ctx.fillRect(x, y, s + 0.35, s + 0.35);
    return;
  }
  if (shape === "dot") {
    ctx.beginPath();
    ctx.arc(x + s / 2, y + s / 2, s * 0.4, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  if (shape === "diamond") {
    const cut = s * 0.28;
    ctx.beginPath();
    ctx.moveTo(x + cut, y);
    ctx.lineTo(x + s - cut, y);
    ctx.lineTo(x + s, y + cut);
    ctx.lineTo(x + s, y + s - cut);
    ctx.lineTo(x + s - cut, y + s);
    ctx.lineTo(x + cut, y + s);
    ctx.lineTo(x, y + s - cut);
    ctx.lineTo(x, y + cut);
    ctx.closePath();
    ctx.fill();
    return;
  }
  const rad = shape === "squircle" ? s * 0.46 : s * 0.34;
  const nw = !north && !west ? rad : 0;
  const ne = !north && !east ? rad : 0;
  const se = !south && !east ? rad : 0;
  const sw = !south && !west ? rad : 0;
  traceRound(ctx, x, y, s + 0.35, s + 0.35, [nw, ne, se, sw]);
  ctx.fill();
}

function drawEye(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  s: number,
  fg: string,
  bg: string,
  eye: EyeShape,
) {
  const o = 7 * s;
  ctx.fillStyle = bg;
  ctx.fillRect(x - s * 0.2, y - s * 0.2, o + s * 0.4, o + s * 0.4);
  if (eye === "circle") {
    const cx = x + o / 2;
    const cy = y + o / 2;
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(cx, cy, o / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.arc(cx, cy, 2.5 * s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = fg;
    ctx.beginPath();
    ctx.arc(cx, cy, 1.5 * s, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  const outer = eye === "square" ? 0 : eye === "leaf" ? s * 1.7 : s * 1.25;
  const mid = eye === "square" ? 0 : eye === "leaf" ? s * 0.95 : s * 0.8;
  const core = eye === "square" ? 0 : eye === "leaf" ? s * 0.5 : s * 0.55;
  const leaf = (n: number): [number, number, number, number] => [n, n, n * 0.18, n];
  fillRound(ctx, x, y, o, o, eye === "leaf" ? leaf(outer) : outer, fg);
  fillRound(ctx, x + s, y + s, 5 * s, 5 * s, eye === "leaf" ? leaf(mid) : mid, bg);
  fillRound(ctx, x + 2 * s, y + 2 * s, 3 * s, 3 * s, eye === "leaf" ? leaf(core) : core, fg);
}

function drawInstagram(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  const g = ctx.createLinearGradient(x, y + s, x + s, y);
  g.addColorStop(0, "#F7CE68");
  g.addColorStop(0.45, "#E1306C");
  g.addColorStop(1, "#833AB4");
  traceRound(ctx, x, y, s, s, s * 0.28);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.strokeStyle = "#F7EFE7";
  ctx.lineWidth = Math.max(1.5, s * 0.07);
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s * 0.22, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = "#F7EFE7";
  ctx.beginPath();
  ctx.arc(x + s * 0.73, y + s * 0.27, s * 0.055, 0, Math.PI * 2);
  ctx.fill();
}

function drawFacebook(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "#1877F2";
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#F7EFE7";
  ctx.font = `700 ${Math.round(s * 0.62)}px Outfit, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("f", x + s * 0.54, y + s * 0.54);
}

function drawWhatsApp(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.fillStyle = "#128C7E";
  ctx.beginPath();
  ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#F7EFE7";
  ctx.fillStyle = "#F7EFE7";
  ctx.lineWidth = Math.max(1.5, s * 0.065);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const cx = x + s * 0.5;
  const cy = y + s * 0.48;
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.22, 0.4, Math.PI * 2 - 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.16, cy + s * 0.12);
  ctx.lineTo(cx - s * 0.22, cy + s * 0.26);
  ctx.lineTo(cx - s * 0.04, cy + s * 0.16);
  ctx.stroke();
}

function drawWeb(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, fg: string) {
  const cx = x + s / 2;
  const cy = y + s / 2;
  ctx.strokeStyle = fg;
  ctx.lineWidth = Math.max(1.5, s * 0.06);
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.ellipse(cx, cy, s * 0.16, s * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.4, cy);
  ctx.lineTo(cx + s * 0.4, cy);
  ctx.moveTo(cx, cy - s * 0.4);
  ctx.lineTo(cx, cy + s * 0.4);
  ctx.stroke();
}

function drawMarkIcon(
  ctx: CanvasRenderingContext2D,
  kind: MarkKind,
  x: number,
  y: number,
  s: number,
  fg: string,
  upload: HTMLImageElement | null,
) {
  if (kind === "instagram") drawInstagram(ctx, x, y, s);
  else if (kind === "facebook") drawFacebook(ctx, x, y, s);
  else if (kind === "whatsapp") drawWhatsApp(ctx, x, y, s);
  else if (kind === "web") drawWeb(ctx, x, y, s, fg);
  else if (kind === "upload" && upload) {
    ctx.save();
    traceRound(ctx, x, y, s, s, s * 0.18);
    ctx.clip();
    cover(ctx, upload, x, y, s, s);
    ctx.restore();
  }
}

function fillTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
) {
  const chars = Array.from(text);
  if (!chars.length) return;
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + tracking * (chars.length - 1);
  let cursor = x - total / 2;
  const prev = ctx.textAlign;
  ctx.textAlign = "center";
  for (let i = 0; i < chars.length; i++) {
    const w = widths[i] ?? 0;
    ctx.fillText(chars[i] ?? "", cursor + w / 2, y);
    cursor += w + tracking;
  }
  ctx.textAlign = prev;
}

function statusFor(ratio: number, hasArt: boolean): RenderInfo {
  if (ratio < 3) {
    return { note: "Contrast is too soft for a reliable scan. Push the two colours further apart.", warn: true };
  }
  if (ratio < 4.5) {
    return { note: "Soft contrast. It may scan, but a deeper pairing is safer.", warn: true };
  }
  if (hasArt) {
    return { note: "Ready to scan. The centre art uses high error recovery.", warn: false };
  }
  return { note: "Ready to scan.", warn: false };
}

async function renderMark(
  canvas: HTMLCanvasElement,
  design: Design,
  pixelRatio = 2,
): Promise<RenderInfo> {
  const text = design.data.trim();
  const ratioContrast = contrastRatio(design.fg, design.bg);
  const hasArt =
    design.mark !== "none" || (design.ground !== "off" && Boolean(design.groundDataUrl));
  if (!text) {
    paintEmpty(canvas, design, pixelRatio);
    return { note: "Add a link or a line of text to draw the mark.", warn: true };
  }

  let matrix;
  let version = 1;
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: hasArt ? "H" : "Q" });
    matrix = qr.modules;
    version = qr.version;
  } catch {
    paintEmpty(canvas, design, pixelRatio, "That text is too long for one mark.");
    return { note: "That text is too long for a single code. Shorten it and try again.", warn: true };
  }

  await FONT_READY();
  const groundImg =
    design.ground !== "off" && design.groundDataUrl ? await loadImage(design.groundDataUrl).catch(() => null) : null;
  const markImg =
    design.mark === "upload" && design.markDataUrl ? await loadImage(design.markDataUrl).catch(() => null) : null;

  const n = matrix.size;
  const quiet = Math.max(2, Math.min(8, Math.round(design.quiet)));
  const span = n + quiet * 2;
  const qrSize = Math.max(180, design.size);
  const cell = qrSize / span;
  const pad = Math.round(qrSize * 0.085);
  const caption = (design.captionCaps ? design.caption.toUpperCase() : design.caption).trim();
  const sub = (design.captionCaps ? design.captionSub.toUpperCase() : design.captionSub).trim();
  const showCaption = design.showCaption && Boolean(caption || sub);
  const capH = showCaption ? Math.round(qrSize * (caption && sub ? 0.24 : 0.16)) : 0;
  const w = qrSize + pad * 2;
  const h = qrSize + pad * 2 + capH;
  const ratio = Math.min(pixelRatio, 2400 / Math.max(w, h));

  canvas.width = Math.max(1, Math.round(w * ratio));
  canvas.height = Math.max(1, Math.round(h * ratio));
  const ctx = canvas.getContext("2d");
  if (!ctx) return { note: "Could not draw the mark.", warn: true };
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.imageSmoothingEnabled = true;

  const full = design.ground === "full" && groundImg;
  if (full && groundImg) {
    cover(ctx, groundImg, 0, 0, w, h);
    ctx.fillStyle = hexAlpha(design.bg, 0.9);
    ctx.fillRect(pad, pad, qrSize, qrSize);
  } else {
    ctx.fillStyle = design.bg;
    ctx.fillRect(0, 0, w, h);
  }

  const ox = pad + quiet * cell;
  const oy = pad + quiet * cell;
  ctx.fillStyle = design.fg;

  const dark = (row: number, col: number) => {
    if (row < 0 || col < 0 || row >= n || col >= n) return false;
    return matrix.get(row, col);
  };

  for (let row = 0; row < n; row++) {
    for (let col = 0; col < n; col++) {
      if (finderOrigin(row, col, n)) continue;
      if (!matrix.get(row, col)) continue;
      const shape = keepSolid(row, col, version, n) ? "square" : design.module;
      drawModule(
        ctx,
        ox + col * cell,
        oy + row * cell,
        cell,
        shape,
        dark(row - 1, col),
        dark(row, col + 1),
        dark(row + 1, col),
        dark(row, col - 1),
      );
    }
  }

  const eyes = [
    { r0: 0, c0: 0 },
    { r0: 0, c0: n - 7 },
    { r0: n - 7, c0: 0 },
  ];
  for (const eye of eyes) {
    drawEye(ctx, ox + eye.c0 * cell, oy + eye.r0 * cell, cell, design.fg, design.bg, design.eye);
  }

  const cx = pad + qrSize / 2;
  const cy = pad + qrSize / 2;

  if (design.ground === "center" && groundImg) {
    const side = qrSize * 0.36;
    ctx.save();
    traceRound(ctx, cx - side / 2, cy - side / 2, side, side, side * 0.16);
    ctx.clip();
    cover(ctx, groundImg, cx - side / 2, cy - side / 2, side, side);
    ctx.restore();
  }

  if (design.ground === "small" && groundImg) {
    const side = qrSize * 0.16;
    ctx.save();
    traceRound(ctx, cx - side / 2, cy - side / 2, side, side, side * 0.22);
    ctx.clip();
    cover(ctx, groundImg, cx - side / 2, cy - side / 2, side, side);
    ctx.restore();
    ctx.strokeStyle = design.bg;
    ctx.lineWidth = Math.max(3, cell * 0.35);
    traceRound(ctx, cx - side / 2, cy - side / 2, side, side, side * 0.22);
    ctx.stroke();
  }

  if (design.mark !== "none" && (design.mark !== "upload" || markImg)) {
    const plate = qrSize * Math.max(0.16, Math.min(0.3, design.markScale));
    const px = cx - plate / 2;
    const py = cy - plate / 2;
    fillRound(ctx, px, py, plate, plate, plate * 0.22, design.bg);
    const inset = plate * 0.16;
    drawMarkIcon(ctx, design.mark, px + inset, py + inset, plate - inset * 2, design.fg, markImg);
  }

  if (showCaption) {
    if (full) {
      ctx.fillStyle = design.bg;
      ctx.fillRect(0, pad + qrSize, w, h - (pad + qrSize));
    }
    const family = design.captionFont === "serif" ? "Fraunces, Georgia, serif" : "Outfit, sans-serif";
    const weight = design.captionBold ? 600 : 500;
    const style = design.captionItalic ? "italic" : "normal";
    const maxW = w - pad * 1.4;
    let fontSize = Math.round(qrSize * (design.captionCaps ? 0.062 : 0.072));
    ctx.textBaseline = "middle";
    ctx.fillStyle = design.fg;
    if (caption) {
      ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
      while (fontSize > 12 && ctx.measureText(caption).width > maxW) {
        fontSize -= 1;
        ctx.font = `${style} ${weight} ${fontSize}px ${family}`;
      }
      const y = pad + qrSize + capH * (sub ? 0.36 : 0.5);
      fillTracked(ctx, caption, w / 2, y, design.captionCaps ? fontSize * 0.14 : fontSize * 0.02);
    }
    if (sub) {
      const subSize = Math.max(11, Math.round(fontSize * 0.62));
      ctx.font = `400 ${subSize}px ${family}`;
      ctx.fillStyle = hexAlpha(design.fg, 0.72);
      const y = pad + qrSize + capH * (caption ? 0.72 : 0.5);
      fillTracked(ctx, sub, w / 2, y, design.captionCaps ? subSize * 0.16 : subSize * 0.04);
    }
  }

  return statusFor(ratioContrast, hasArt);
}

function paintEmpty(canvas: HTMLCanvasElement, design: Design, pixelRatio: number, message = "Paste a link") {
  const size = Math.max(220, design.size + 80);
  const ratio = Math.min(pixelRatio, 2);
  canvas.width = Math.round(size * ratio);
  canvas.height = Math.round(size * 0.86 * ratio);
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.fillStyle = design.bg;
  ctx.fillRect(0, 0, size, size * 0.86);
  ctx.fillStyle = design.fg;
  ctx.font = "500 22px Fraunces, Georgia, serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(message, size / 2, size * 0.4);
  ctx.font = "400 14px Outfit, sans-serif";
  ctx.fillStyle = hexAlpha(design.fg, 0.7);
  ctx.fillText("The studio will draw it here.", size / 2, size * 0.52);
}

async function exportMark(design: Design, kind: "png" | "jpeg") {
  const canvas = document.createElement("canvas");
  const info = await renderMark(canvas, design, 3);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, kind === "png" ? "image/png" : "image/jpeg", 0.93),
  );
  if (!blob) throw new Error("Could not export.");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const slug = (design.templateId || "mark").replace(/[^a-z0-9-]+/gi, "").slice(0, 32) || "mark";
  a.href = url;
  a.download = `aurel-${slug}.${kind === "png" ? "png" : "jpg"}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return info;
}

// ==========================================================================
// 3 & 4. State and router
// ==========================================================================


// ------------------------------------------------------------------------
// Studio state — one small store, saved in localStorage (same key + shape as
// before, so designs people already saved keep working). Anything read back
// from storage is validated, never trusted.
// ------------------------------------------------------------------------

const STORAGE_KEY = "aurel-studio";
const HEX = /^#[0-9a-f]{6}$/i;
const IMG_URL = /^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i;
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T =>
  typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : fallback;
const num = (v: unknown, min: number, max: number, fallback: number) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : fallback;
const str = (v: unknown, max: number, fallback: string) =>
  typeof v === "string" ? v.slice(0, max) : fallback;
const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
const color = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);
const imageUrl = (v: unknown, max: number) =>
  typeof v === "string" && v.length < max && IMG_URL.test(v) ? v : null;

function sanitize(raw: unknown): Design {
  const d = defaultDesign;
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const known = (id: unknown) =>
    typeof id === "string" && LOOKS.some((l) => l.id === id) ? id : null;
  return {
    data: str(r.data, 2000, d.data),
    fg: color(r.fg, d.fg),
    bg: color(r.bg, d.bg),
    module: oneOf(r.module, ["square", "rounded", "dot", "squircle", "diamond"], d.module),
    eye: oneOf(r.eye, ["square", "rounded", "circle", "leaf"], d.eye),
    size: num(r.size, 220, 640, d.size),
    quiet: num(r.quiet, 2, 8, d.quiet),
    mark: oneOf(r.mark, ["none", "instagram", "facebook", "whatsapp", "web", "upload"], d.mark),
    markDataUrl: imageUrl(r.markDataUrl, 450_000),
    markScale: num(r.markScale, 0.16, 0.3, d.markScale),
    ground: oneOf(r.ground, ["off", "small", "center", "full"], d.ground),
    groundDataUrl: imageUrl(r.groundDataUrl, 700_000),
    caption: str(r.caption, 120, d.caption),
    captionSub: str(r.captionSub, 120, d.captionSub),
    captionBold: bool(r.captionBold, d.captionBold),
    captionItalic: bool(r.captionItalic, d.captionItalic),
    captionCaps: bool(r.captionCaps, d.captionCaps),
    captionFont: oneOf(r.captionFont, ["serif", "sans"], d.captionFont),
    showCaption: bool(r.showCaption, d.showCaption),
    paletteId: known(r.paletteId),
    templateId: known(r.templateId),
  };
}

function loadDesign(): Design {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as { state?: unknown } | null;
    return sanitize(saved?.state);
  } catch {
    return { ...defaultDesign };
  }
}

let state: Design = loadDesign();
const listeners = new Set<() => void>();
let saveTimer: number | undefined;

function save() {
  try {
    const keep = { ...state };
    if (keep.markDataUrl && keep.markDataUrl.length >= 450_000) keep.markDataUrl = null;
    if (keep.groundDataUrl && keep.groundDataUrl.length >= 700_000) keep.groundDataUrl = null;
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ state: keep, version: 0 }));
  } catch {
    /* private mode or full storage: the studio still works, it just won't remember */
  }
}

function setState(partial: Partial<Design>) {
  state = { ...state, ...partial };
  listeners.forEach((l) => l());
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(save, 150);
}
window.addEventListener("pagehide", save);

const studio = {
  get: () => state,
  patch: (partial: Partial<Design>) => setState(partial),
  applyLook: (look: Look) =>
    setState({
      fg: look.fg,
      bg: look.bg,
      module: look.module,
      eye: look.eye,
      caption: look.caption,
      captionSub: look.sub,
      captionBold: look.bold,
      captionItalic: look.italic,
      captionCaps: false,
      captionFont: look.font,
      showCaption: true,
      paletteId: look.id,
      templateId: look.id,
    }),
  applyPalette: (look: Look) => setState({ fg: look.fg, bg: look.bg, paletteId: look.id }),
};

function useStudio(): Design {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

// ------------------------------------------------------------------------
// Hash router — "#/studio" style links never 404 on GitHub Pages, even on
// refresh or when the site lives under /<repo-name>/.
// ------------------------------------------------------------------------

type Path = "/" | "/studio" | "/templates";
const PATHS: Path[] = ["/", "/studio", "/templates"];
const META: Record<Path, { title: string; description: string }> = {
  "/": {
    title: "Aurel — QR Atelier",
    description:
      "Paste a link. Shape a scannable mark. Export PNG or JPG from a quiet studio built for cards, menus, and posters.",
  },
  "/studio": {
    title: "Studio — Aurel",
    description: "Shape, colour, icon, background, and lettering for a scannable QR card. Export PNG or JPG.",
  },
  "/templates": {
    title: "Templates — Aurel",
    description: "Fifty-six ready QR looks. Choose one and open it in the studio.",
  },
};

function readPath(): Path {
  const p = (window.location.hash.replace(/^#/, "").split("?")[0] || "/") as Path;
  return PATHS.includes(p) ? p : "/";
}

function usePath(): Path {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("hashchange", cb);
      return () => window.removeEventListener("hashchange", cb);
    },
    readPath,
    () => "/" as Path,
  );
}

function navigate(to: Path) {
  window.location.hash = to;
}

function Link({ to, ...rest }: { to: Path } & Omit<ComponentProps<"a">, "href">) {
  return <a href={`#${to}`} {...rest} />;
}

// ==========================================================================
// 5. Shared UI
// ==========================================================================


function QrView({
  design,
  pixelRatio = 2,
  className,
  framed = true,
}: {
  design: Design;
  pixelRatio?: number;
  className?: string;
  framed?: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [info, setInfo] = useState<RenderInfo | null>(null);
  const key = useMemo(() => JSON.stringify(design), [design]);
  const latest = useRef(design);
  latest.current = design;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let cancel = false;
    renderMark(canvas, latest.current, pixelRatio)
      .then((next) => {
        if (!cancel) setInfo(next);
      })
      .catch(() => {
        if (!cancel) setInfo({ note: "Could not draw that mark.", warn: true });
      });
    return () => {
      cancel = true;
    };
  }, [key, pixelRatio]);

  return (
    <figure className={cn("m-0", className)}>
      <div className={cn(framed && "overflow-hidden rounded-card bg-paper shadow-lift")}>
        <canvas ref={ref} className="block h-auto w-full" role="img" aria-label="QR code preview" />
      </div>
      {info ? (
        <figcaption className={cn("mt-3 text-sm", info.warn ? "text-rose" : "text-blush")}>{info.note}</figcaption>
      ) : (
        <figcaption className="mt-3 text-sm text-blush">Drawing the mark…</figcaption>
      )}
    </figure>
  );
}


const LINKS = [
  { to: "/", label: "Home" },
  { to: "/studio", label: "Studio" },
  { to: "/templates", label: "Templates" },
] as const;

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ink", className)}>
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill="currentColor" />
        <rect x="6" y="6" width="8" height="8" rx="1.5" fill="var(--color-cream)" />
        <rect x="18" y="6" width="8" height="8" rx="1.5" fill="var(--color-cream)" />
        <rect x="6" y="18" width="8" height="8" rx="1.5" fill="var(--color-cream)" />
        <rect x="20" y="20" width="4" height="4" fill="var(--color-sand)" />
      </svg>
      <span className="display text-2xl leading-none">Aurel</span>
    </span>
  );
}

function Header() {
  const path = usePath();
  return (
    <header className="sticky top-0 z-40 border-b border-linen/80 bg-cream/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <Link to="/" aria-label="Aurel home" className="shrink-0">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Primary">
          {LINKS.map((link) => {
            const active = path === link.to;
            return (
              <Link
                key={link.to}
                to={link.to}
                className={cn(
                  "rounded-full px-3 py-2 text-sm font-medium transition-colors duration-200",
                  active ? "bg-ink text-cream" : "text-rose hover:bg-linen hover:text-ink",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t border-linen">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-10 sm:px-6 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Wordmark />
          <p className="mt-3 max-w-sm text-sm text-rose">
            A studio for marks that still scan. Drawn in the browser, exported as PNG or JPG, ready for a card, a menu, a window.
          </p>
        </div>
        <p className="text-xs tracking-widest text-blush uppercase">Dusty rose · Quiet type · Real codes</p>
      </div>
    </footer>
  );
}


const SHAPES: { id: ModuleShape; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "squircle", label: "Soft" },
  { id: "dot", label: "Dot" },
  { id: "diamond", label: "Diamond" },
];

const EYES: { id: EyeShape; label: string }[] = [
  { id: "square", label: "Square" },
  { id: "rounded", label: "Rounded" },
  { id: "circle", label: "Circle" },
  { id: "leaf", label: "Leaf" },
];

const MARKS: { id: MarkKind; label: string }[] = [
  { id: "none", label: "None" },
  { id: "instagram", label: "Instagram" },
  { id: "facebook", label: "Facebook" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "web", label: "Website" },
  { id: "upload", label: "Gallery" },
];

const GROUNDS: { id: GroundMode; label: string }[] = [
  { id: "off", label: "Plain" },
  { id: "small", label: "Small" },
  { id: "center", label: "Centre" },
  { id: "full", label: "Full" },
];

function Section({ kicker, title, children }: { kicker: string; title: string; children: ReactNode }) {
  return (
    <section className="border-t border-linen pt-6">
      <p className="text-xs tracking-widest text-blush uppercase">{kicker}</p>
      <h2 className="display mt-1 text-3xl">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Choice({
  active,
  label,
  name,
  onClick,
  children,
}: {
  active: boolean;
  label: string;
  name?: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={name ?? label}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center gap-1 rounded-2xl border px-2 py-2 text-xs font-medium transition-transform duration-150 ease-out active:scale-[0.96]",
        active ? "border-ink bg-ink text-cream" : "border-linen bg-paper text-ink hover:border-sand",
      )}
    >
      {children}
      {label}
    </button>
  );
}

function ShapeGlyph({ id }: { id: ModuleShape }) {
  const common = "fill-current";
  if (id === "dot") return <svg viewBox="0 0 24 24" className="size-5" aria-hidden><circle className={common} cx="12" cy="12" r="6" /></svg>;
  if (id === "diamond") return <svg viewBox="0 0 24 24" className="size-5" aria-hidden><path className={common} d="M12 3 21 12 12 21 3 12Z" /></svg>;
  const r = id === "square" ? 1 : id === "rounded" ? 4 : 7;
  return <svg viewBox="0 0 24 24" className="size-5" aria-hidden><rect className={common} x="4" y="4" width="16" height="16" rx={r} /></svg>;
}

function StudioPanel() {
  const design = useStudio();
  const patch = studio.patch;
  const applyPalette = studio.applyPalette;
  const markInput = useRef<HTMLInputElement>(null);
  const groundInput = useRef<HTMLInputElement>(null);
  const [fileNote, setFileNote] = useState<string | null>(null);

  async function onFile(file: File | undefined, slot: "mark" | "ground") {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setFileNote("Use a JPG or PNG.");
      return;
    }
    if (file.size > 8_000_000) {
      setFileNote("That file is over 8MB. Try a smaller picture.");
      return;
    }
    try {
      const url = await shrinkImage(file, slot === "mark" ? 640 : 1200);
      if (slot === "mark") patch({ mark: "upload", markDataUrl: url });
      else patch({ groundDataUrl: url, ground: design.ground === "off" ? "center" : design.ground });
      setFileNote(null);
    } catch (error) {
      setFileNote(error instanceof Error ? error.message : "Could not read that picture.");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <Section kicker="01 — Content" title="Where it leads">
        <label className="block text-sm text-rose" htmlFor="qr-data">
          Link, phone, or a sentence
        </label>
        <textarea
          id="qr-data"
          value={design.data}
          onChange={(e) => patch({ data: e.target.value })}
          rows={3}
          className="mt-2 w-full resize-none rounded-2xl border border-linen bg-paper px-4 py-3 outline-none"
        />
      </Section>

      <Section kicker="02 — Form" title="Shape and scale">
        <p className="mb-2 text-sm text-rose">Modules</p>
        <div className="grid grid-cols-5 gap-2">
          {SHAPES.map((shape) => (
            <Choice key={shape.id} active={design.module === shape.id} label={shape.label} name={`${shape.label} modules`} onClick={() => patch({ module: shape.id })}>
              <ShapeGlyph id={shape.id} />
            </Choice>
          ))}
        </div>
        <p className="mt-4 mb-2 text-sm text-rose">Eyes</p>
        <div className="grid grid-cols-4 gap-2">
          {EYES.map((eye) => (
            <Choice key={eye.id} active={design.eye === eye.id} label={eye.label} name={`${eye.label} eyes`} onClick={() => patch({ eye: eye.id })} />
          ))}
        </div>
        <label className="mt-5 flex items-center justify-between text-sm" htmlFor="qr-size">
          <span>Size</span>
          <span className="text-rose">{design.size}px</span>
        </label>
        <input
          id="qr-size"
          type="range"
          min={220}
          max={640}
          step={10}
          value={design.size}
          onChange={(e) => patch({ size: Number(e.target.value) })}
          className="mt-2 w-full accent-ink"
        />
        <label className="mt-4 flex items-center justify-between text-sm" htmlFor="qr-quiet">
          <span>Quiet margin</span>
          <span className="text-rose">{design.quiet}</span>
        </label>
        <input
          id="qr-quiet"
          type="range"
          min={2}
          max={6}
          step={1}
          value={design.quiet}
          onChange={(e) => patch({ quiet: Number(e.target.value) })}
          className="mt-2 w-full accent-ink"
        />
      </Section>

      <Section kicker="03 — Colour" title="Fifty-six pairings">
        <p className="mb-3 text-sm text-rose">Foreground and ground, chosen as a pair. Or set each yourself.</p>
        <div className="grid max-h-64 grid-cols-6 gap-2 overflow-y-auto pr-1 sm:grid-cols-8">
          {LOOKS.map((look) => (
            <button
              key={look.id}
              type="button"
              title={`${look.palette} — ${look.name}`}
              aria-label={`${look.palette}, ${look.fg} on ${look.bg}`}
              aria-pressed={design.paletteId === look.id}
              onClick={() => applyPalette(look)}
              className={cn(
                "relative h-11 overflow-hidden rounded-full border transition-transform duration-150 ease-out active:scale-[0.96]",
                design.paletteId === look.id ? "border-ink ring-2 ring-ink ring-offset-2 ring-offset-cream" : "border-linen",
              )}
            >
              <span className="absolute inset-y-0 left-0 w-1/2" style={{ background: look.fg }} />
              <span className="absolute inset-y-0 right-0 w-1/2" style={{ background: look.bg }} />
            </button>
          ))}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <label className="flex items-center gap-3 rounded-2xl border border-linen bg-paper px-3 py-2 text-sm">
            <input
              type="color"
              value={design.fg}
              aria-label="Foreground colour"
              onChange={(e) => patch({ fg: e.target.value, paletteId: null })}
              className="size-11 rounded-full border border-linen bg-transparent"
            />
            Foreground
          </label>
          <label className="flex items-center gap-3 rounded-2xl border border-linen bg-paper px-3 py-2 text-sm">
            <input
              type="color"
              value={design.bg}
              aria-label="Background colour"
              onChange={(e) => patch({ bg: e.target.value, paletteId: null })}
              className="size-11 rounded-full border border-linen bg-transparent"
            />
            Background
          </label>
        </div>
      </Section>

      <Section kicker="04 — Mark" title="Centre icon">
        <div className="grid grid-cols-3 gap-2">
          {MARKS.map((mark) => (
            <Choice
              key={mark.id}
              active={design.mark === mark.id}
              label={mark.label}
              onClick={() => {
                if (mark.id === "upload") markInput.current?.click();
                else patch({ mark: mark.id });
              }}
            />
          ))}
        </div>
        <input
          ref={markInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0], "mark");
            e.target.value = "";
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => markInput.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-linen bg-paper px-4 text-sm transition-transform duration-150 active:scale-[0.96]"
          >
            <ImagePlus className="size-4" aria-hidden />
            Upload from gallery
          </button>
          {design.markDataUrl ? (
            <button
              type="button"
              onClick={() => patch({ markDataUrl: null, mark: design.mark === "upload" ? "none" : design.mark })}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-rose"
            >
              <X className="size-4" aria-hidden />
              Remove
            </button>
          ) : null}
        </div>
        <label className="mt-4 flex items-center justify-between text-sm" htmlFor="mark-scale">
          <span>Icon size</span>
          <span className="text-rose">{Math.round(design.markScale * 100)}%</span>
        </label>
        <input
          id="mark-scale"
          type="range"
          min={16}
          max={30}
          step={1}
          value={Math.round(design.markScale * 100)}
          onChange={(e) => patch({ markScale: Number(e.target.value) / 100 })}
          className="mt-2 w-full accent-ink"
        />
      </Section>

      <Section kicker="05 — Ground" title="Picture behind">
        <div className="grid grid-cols-4 gap-2">
          {GROUNDS.map((ground) => (
            <Choice key={ground.id} active={design.ground === ground.id} label={ground.label} name={`${ground.label} background`} onClick={() => patch({ ground: ground.id })} />
          ))}
        </div>
        <p className="mt-3 text-sm text-rose">
          Small sits like a stamp. Centre is a plate. Full bleeds the photo to the edge and veils the code so it still scans.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => groundInput.current?.click()}
            className="inline-flex min-h-11 items-center gap-2 rounded-full border border-linen bg-paper px-4 text-sm transition-transform duration-150 active:scale-[0.96]"
          >
            <ImagePlus className="size-4" aria-hidden />
            Upload background
          </button>
          {design.groundDataUrl ? (
            <button
              type="button"
              onClick={() => patch({ groundDataUrl: null, ground: "off" })}
              className="inline-flex min-h-11 items-center gap-2 rounded-full px-3 text-sm text-rose"
            >
              <X className="size-4" aria-hidden />
              Clear
            </button>
          ) : null}
        </div>
        <input
          ref={groundInput}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          onChange={(e) => {
            void onFile(e.target.files?.[0], "ground");
            e.target.value = "";
          }}
        />
        {fileNote ? <p className="mt-2 text-sm text-rose">{fileNote}</p> : null}
      </Section>

      <Section kicker="06 — Lettering" title="Words on the card">
        <label className="block text-sm text-rose" htmlFor="cap">
          Main line
        </label>
        <input
          id="cap"
          value={design.caption}
          onChange={(e) => patch({ caption: e.target.value })}
          className="mt-2 w-full rounded-2xl border border-linen bg-paper px-4 py-3 outline-none"
        />
        <label className="mt-3 block text-sm text-rose" htmlFor="sub">
          Second line
        </label>
        <input
          id="sub"
          value={design.captionSub}
          onChange={(e) => patch({ captionSub: e.target.value })}
          className="mt-2 w-full rounded-2xl border border-linen bg-paper px-4 py-3 outline-none"
        />
        <div className="mt-4 flex flex-wrap gap-2">
          <Toggle on={design.showCaption} label="Show" pressed={() => patch({ showCaption: !design.showCaption })} />
          <Toggle on={design.captionBold} label="Bold" pressed={() => patch({ captionBold: !design.captionBold })} />
          <Toggle on={design.captionItalic} label="Italic" pressed={() => patch({ captionItalic: !design.captionItalic })} />
          <Toggle on={design.captionCaps} label="Caps" pressed={() => patch({ captionCaps: !design.captionCaps })} />
          <Toggle
            on={design.captionFont === "serif"}
            label={design.captionFont === "serif" ? "Serif" : "Sans"}
            pressed={() => patch({ captionFont: design.captionFont === "serif" ? "sans" : "serif" })}
          />
        </div>
      </Section>
    </div>
  );
}

function Toggle({ on, label, pressed }: { on: boolean; label: string; pressed: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={pressed}
      className={cn(
        "min-h-11 rounded-full px-4 text-sm font-medium transition-transform duration-150 active:scale-[0.96]",
        on ? "bg-ink text-cream" : "border border-linen bg-paper text-ink",
      )}
    >
      {label}
    </button>
  );
}

// ==========================================================================
// 6. Pages
// ==========================================================================

// ---- Home ----

function Home() {
  const patch = studio.patch;
  const [value, setValue] = useState(() => studio.get().data);
  const [error, setError] = useState<string | null>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [shift, setShift] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const mid = window.innerHeight * 0.5;
      setShift(Math.max(-18, Math.min(18, (window.scrollY - mid) * 0.04)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const live = useMemo<Design>(
    () => ({
      ...defaultDesign,
      data: normalizeTarget(value) || "https://aurel.studio",
      showCaption: true,
      caption: "A mark worth scanning",
      captionSub: "Aurel atelier",
      size: 320,
    }),
    [value],
  );

  function generate() {
    const next = normalizeTarget(value);
    if (!next) {
      setError("Add a link or a line of text.");
      return;
    }
    setError(null);
    patch({ data: next });
    navigate("/studio");
  }

  return (
    <main>
      <section
        className="relative overflow-hidden"
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          setTilt({
            x: (e.clientX - r.left) / r.width - 0.5,
            y: (e.clientY - r.top) / r.height - 0.5,
          });
        }}
        onMouseLeave={() => setTilt({ x: 0, y: 0 })}
      >
        <p
          aria-hidden
          className="ghost-word display pointer-events-none absolute -top-8 right-0 hidden text-linen select-none lg:block"
          style={{ transform: `translateY(${shift}px)` }}
        >
          Aurel
        </p>
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 pt-14 pb-8 sm:px-6 lg:grid-cols-[1.15fr_0.85fr] lg:pt-20">
          <div>
            <p className="rise text-xs tracking-widest text-rose uppercase">QR atelier</p>
            <h1 className="display rise mt-4 text-5xl text-ink sm:text-7xl" style={{ animationDelay: "80ms" }}>
              Make the mark
              <span className="block italic text-rose">feel considered.</span>
            </h1>
            <p className="rise mt-6 max-w-xl text-lg text-rose" style={{ animationDelay: "160ms" }}>
              Aurel is a quiet studio for QR codes — the kind you put on a card, a menu, a poster, a window. Not a generator that looks like a settings page. Paste a destination, then shape the code until it belongs to the work.
            </p>
            <p className="rise mt-4 max-w-xl text-base text-ink/80" style={{ animationDelay: "220ms" }}>
              Fifty-six colour pairings. Modules from strict squares to soft dots. A centre mark for Instagram, Facebook, WhatsApp, a website, or a picture from your gallery. Grounds that sit small, centred, or full-bleed. Export a real PNG or JPG. The code still scans.
            </p>
          </div>
          <div className="float-y rise" style={{ animationDelay: "200ms" }}>
            <div
              className="tilt"
              style={{ transform: `rotateY(${tilt.x * 10}deg) rotateX(${tilt.y * -8}deg)` }}
            >
              <QrView design={live} />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-16 sm:px-6">
        <label htmlFor="destination" className="text-sm text-rose">
          Where should this mark lead?
        </label>
        <form
          className="mt-3 flex flex-col gap-2 rounded-card border border-linen bg-paper p-2 shadow-lift sm:flex-row sm:items-center"
          onSubmit={(e) => {
            e.preventDefault();
            generate();
          }}
        >
          <div className="flex min-h-14 flex-1 items-center gap-3 px-3">
            <Link2 className="size-5 shrink-0 text-blush" aria-hidden />
            <input
              id="destination"
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError(null);
              }}
              placeholder="https://your-site.com"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="w-full bg-transparent py-3 text-lg outline-none placeholder:text-sand"
            />
          </div>
          <button
            type="submit"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-ink px-6 text-cream transition-transform duration-150 ease-out active:scale-[0.96]"
          >
            Generate
            <ArrowUpRight className="size-4" aria-hidden />
          </button>
        </form>
        <p className={cn("mt-3 text-sm", error ? "text-rose" : "text-blush")}>
          {error ??
            "Links, phone numbers, and plain sentences all work. Generate carries this destination into the studio."}
        </p>
      </section>

      <Motions />
      <Rooms />
      <PaletteRail />
      <TemplateTease />
    </main>
  );
}

function Motions() {
  return (
    <section className="border-t border-linen bg-paper/50">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <p className="text-xs tracking-widest text-rose uppercase">Motion, kept quiet</p>
        <h2 className="display mt-3 max-w-2xl text-4xl sm:text-5xl">Six gestures. None of them decoration for its own sake.</h2>
        <p className="mt-4 max-w-2xl text-rose">
          Hover, a loader, a turn in light, an entrance, a press, a shift in depth. They are how this site moves — and how the studio should feel when you change a colour or export a file.
        </p>
        <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <article className="group rounded-card border border-linen bg-cream p-5">
            <p className="text-xs tracking-widest text-blush uppercase">Hover</p>
            <h3 className="display mt-2 text-3xl">Cards that acknowledge a hand</h3>
            <div className="relative mt-6 h-36">
              <div className="absolute top-8 left-4 h-20 w-32 rounded-2xl bg-blush transition-transform duration-300 ease-out group-hover:-translate-x-3 group-hover:-rotate-12" />
              <div className="absolute top-6 left-10 h-20 w-32 rounded-2xl bg-sand transition-transform duration-300 ease-out group-hover:translate-x-4 group-hover:rotate-6" />
              <div className="absolute top-3 left-8 flex h-20 w-36 items-end rounded-2xl bg-paper p-3 shadow-lift transition-transform duration-300 ease-out group-hover:-translate-y-2">
                <span className="text-sm font-medium">Preferences</span>
              </div>
            </div>
          </article>
          <article className="rounded-card border border-linen bg-cream p-5">
            <p className="text-xs tracking-widest text-blush uppercase">Loader</p>
            <h3 className="display mt-2 text-3xl">A line, then the room</h3>
            <p className="mt-3 text-sm text-rose">The atelier announces itself once, then gets out of the way.</p>
            <div className="mt-8 h-px w-full bg-linen">
              <div className="load-rule h-px w-full bg-ink" />
            </div>
          </article>
          <article className="rounded-card border border-linen bg-ink p-5 text-cream">
            <p className="text-xs tracking-widest text-sand uppercase">3D motion</p>
            <h3 className="display mt-2 text-3xl text-cream">A mark that turns in light</h3>
            <div className="relative mt-6 grid h-36 place-items-center">
              <div className="spin-slow absolute size-32 rounded-full border border-dashed border-sand" />
              <div className="orb size-20 rounded-full shadow-lift" />
            </div>
          </article>
          <article className="rounded-card border border-linen bg-cream p-5">
            <p className="text-xs tracking-widest text-blush uppercase">Entrance</p>
            <h3 className="display mt-2 text-3xl">Type that arrives</h3>
            <p className="rise mt-6 font-serif text-2xl italic text-rose">Not a pop. A reveal.</p>
          </article>
          <article className="rounded-card border border-linen bg-cream p-5">
            <p className="text-xs tracking-widest text-blush uppercase">Micro</p>
            <h3 className="display mt-2 text-3xl">Buttons with a pulse</h3>
            <MicroDemo />
          </article>
          <article className="relative overflow-hidden rounded-card border border-linen bg-linen p-5">
            <ParallaxCard />
          </article>
        </div>
      </div>
    </section>
  );
}

function ParallaxCard() {
  const [y, setY] = useState(0);
  useEffect(() => {
    const onScroll = () => setY(Math.max(-16, Math.min(16, (window.scrollY % 400) * 0.04 - 8)));
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  return (
    <div>
      <p
        aria-hidden
        className="display pointer-events-none absolute -right-2 -bottom-6 text-7xl text-sand"
        style={{ transform: `translateY(${y * 1.8}px)` }}
      >
        Depth
      </p>
      <div className="relative" style={{ transform: `translateY(${y}px)` }}>
        <p className="text-xs tracking-widest text-rose uppercase">Parallax</p>
        <h3 className="display mt-2 text-3xl">Layers that do not share a speed</h3>
        <p className="mt-3 max-w-xs text-sm text-rose">The word behind this card drifts on its own. The headline stays put.</p>
      </div>
    </div>
  );
}

function MicroDemo() {
  const [on, setOn] = useState(false);
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setOn((v) => !v)}
      className="mt-6 inline-flex min-h-11 items-center gap-3 rounded-full bg-ink px-4 text-sm text-cream transition-transform duration-150 ease-out active:scale-[0.96]"
    >
      <span
        className={cn(
          "grid size-6 place-items-center rounded-full transition-[opacity,filter,scale] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
          on ? "scale-100 bg-cream opacity-100 blur-none" : "scale-[0.25] bg-sand opacity-70 blur-[4px]",
        )}
        aria-hidden
      />
      {on ? "Bold, on" : "Press for bold"}
    </button>
  );
}

function Rooms() {
  const rooms = [
    {
      n: "01",
      title: "Home",
      body: "The bar at the top of the house takes a link, a number, or a sentence. Generate opens the studio with that destination already set. Nothing else is asked of you.",
    },
    {
      n: "02",
      title: "Templates",
      body: "Fifty-six ready looks live on their own floor — cafe cards, night lists, vows, editorial proofs. Choose one and it dresses the mark. The studio does not hide them in a drawer.",
    },
    {
      n: "03",
      title: "Studio",
      body: "Shape, size, quiet margin, colour, centre icon, background, and the words on the card. Bold, italic, caps, serif or sans. Then a real PNG or JPG, drawn in the browser.",
    },
  ];
  return (
    <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
      <h2 className="display text-4xl sm:text-5xl">Three rooms. Full control in one of them.</h2>
      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {rooms.map((room) => (
          <article key={room.n} className="border-t border-ink pt-4">
            <p className="text-xs tracking-widest text-blush uppercase">{room.n}</p>
            <h3 className="display mt-2 text-3xl">{room.title}</h3>
            <p className="mt-3 text-sm text-rose">{room.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function PaletteRail() {
  const sample = LOOKS.slice(0, 8);
  return (
    <section className="border-t border-linen">
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs tracking-widest text-rose uppercase">From the rose sheet</p>
            <h2 className="display mt-2 text-4xl">Ink, blush, sand, cream.</h2>
          </div>
          <p className="max-w-md text-sm text-rose">
            The house palette is one family. The codes may wear any of the fifty-six pairings — night, coast, ceremony, signal — as long as the contrast holds.
          </p>
        </div>
        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {sample.map((look) => (
            <div key={look.id} className="overflow-hidden rounded-2xl border border-linen">
              <div className="h-16" style={{ background: look.bg }} />
              <div className="h-8" style={{ background: look.fg }} />
              <p className="bg-paper px-2 py-2 text-xs">{look.palette}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TemplateTease() {
  const picks = [LOOKS[0], LOOKS[14], LOOKS[35], LOOKS[42], LOOKS[21], LOOKS[49]].filter(Boolean);
  return (
    <section className="mx-auto max-w-6xl px-4 pb-20 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h2 className="display text-4xl sm:text-5xl">Looks, already dressed.</h2>
        <Link
          to="/templates"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-5 text-sm text-cream transition-transform duration-150 active:scale-[0.96]"
        >
          All templates
          <ArrowUpRight className="size-4" aria-hidden />
        </Link>
      </div>
      <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {picks.map((look) =>
          look ? (
            <Link
              key={look.id}
              to="/templates"
              className="flex items-center justify-between rounded-2xl border border-linen bg-paper px-4 py-4 transition-transform duration-200 hover:-translate-y-0.5"
            >
              <span>
                <span className="block text-xs tracking-widest text-blush uppercase">{look.category}</span>
                <span className="display mt-1 block text-2xl">{look.name}</span>
              </span>
              <span className="flex h-12 w-16 overflow-hidden rounded-xl border border-linen">
                <span className="w-1/2" style={{ background: look.fg }} />
                <span className="w-1/2" style={{ background: look.bg }} />
              </span>
            </Link>
          ) : null,
        )}
      </div>
    </section>
  );
}

// ---- Studio ----

function Studio() {
  const design = useStudio();
  const [busy, setBusy] = useState<"png" | "jpeg" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function save(kind: "png" | "jpeg") {
    setBusy(kind);
    setNote(null);
    try {
      await exportMark(design, kind);
      setNote(kind === "png" ? "PNG saved." : "JPG saved.");
    } catch (error) {
      setNote(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
      <div className="order-2 lg:order-1">
        <p className="text-xs tracking-widest text-rose uppercase">Studio</p>
        <h1 className="display mt-2 text-5xl">Every control. One canvas.</h1>
        <p className="mt-4 text-rose">
          Templates stay on their own floor. Here you set the destination, the form, the pairing, the icon, the ground, and the words. What you see is the file.
        </p>
        <p className="mt-3 text-sm">
          <Link to="/templates" className="underline decoration-sand underline-offset-4">
            Borrow a template
          </Link>
        </p>
        <div className="mt-8">
          <StudioPanel />
        </div>
      </div>
      <div className="canvas-stage order-1 rounded-card p-4 sm:p-8 lg:sticky lg:top-24 lg:order-2">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-rose">Live card</p>
          <div className="flex gap-2">
            <ExportButton label="PNG" busy={busy === "png"} onClick={() => void save("png")} />
            <ExportButton label="JPG" busy={busy === "jpeg"} onClick={() => void save("jpeg")} />
          </div>
        </div>
        <QrView design={design} pixelRatio={2} />
        {note ? <p className="mt-2 text-sm text-rose">{note}</p> : null}
      </div>
    </main>
  );
}

function ExportButton({ label, busy, onClick }: { label: string; busy: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-ink px-4 text-sm text-cream transition-transform duration-150 ease-out active:scale-[0.96] disabled:opacity-60"
    >
      <Download className="size-4" aria-hidden />
      {busy ? "Saving" : label}
    </button>
  );
}

// ---- Templates ----

function Templates() {
  const applyLook = studio.applyLook;
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("All");

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LOOKS.filter((look) => {
      if (category !== "All" && look.category !== category) return false;
      if (!q) return true;
      return `${look.name} ${look.palette} ${look.category} ${look.caption}`.toLowerCase().includes(q);
    });
  }, [query, category]);

  function pick(look: Look) {
    applyLook(look);
    navigate("/studio");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <p className="text-xs tracking-widest text-rose uppercase">Templates</p>
      <h1 className="display mt-3 max-w-3xl text-5xl sm:text-6xl">Fifty-six looks, already in good clothes.</h1>
      <p className="mt-5 max-w-2xl text-lg text-rose">
        These are not buried inside the studio. Pick a card — a vow, a ferry, a listening bar, a proof — and it becomes the mark. Your link stays. You can still change every control after.
      </p>
      <div className="mt-8 flex flex-col gap-4">
        <label className="sr-only" htmlFor="look-search">
          Search templates
        </label>
        <input
          id="look-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search night, vow, cafe, ink…"
          className="w-full rounded-full border border-linen bg-paper px-5 py-3 outline-none"
        />
        <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categories">
          {["All", ...CATEGORIES].map((item) => (
            <button
              key={item}
              type="button"
              role="tab"
              aria-selected={category === item}
              onClick={() => setCategory(item)}
              className={cn(
                "shrink-0 rounded-full px-4 py-2 text-sm transition-transform duration-150 active:scale-[0.96]",
                category === item ? "bg-ink text-cream" : "bg-paper text-ink border border-linen",
              )}
            >
              {item}
            </button>
          ))}
        </div>
        <p className="text-sm text-blush">{shown.length} templates</p>
      </div>
      {shown.length === 0 ? (
        <p className="mt-10 text-rose">Nothing under that name. Try cafe, night, or vow.</p>
      ) : (
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((look) => (
            <article key={look.id} className="flex flex-col rounded-card border border-linen bg-paper p-4">
              <Mini look={look} />
              <p className="mt-4 text-xs tracking-widest text-blush uppercase">{look.category}</p>
              <h2 className="display mt-1 text-3xl">{look.name}</h2>
              <p className="mt-1 text-sm text-rose">
                {look.palette}
                <span className="text-blush"> · {look.caption}</span>
              </p>
              <button
                type="button"
                onClick={() => pick(look)}
                className="mt-4 inline-flex min-h-11 items-center justify-center rounded-full bg-ink px-4 text-sm text-cream transition-transform duration-150 active:scale-[0.96]"
              >
                Use this look
              </button>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}

function Mini({ look }: { look: Look }) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setVisible(true);
      },
      { rootMargin: "240px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible || !canvas.current) return;
    const design = designFromLook(look, "https://aurel.studio", false);
    design.size = 220;
    void renderMark(canvas.current, design, 1);
  }, [visible, look]);

  return (
    <div ref={wrap} className="overflow-hidden rounded-2xl bg-linen">
      <canvas ref={canvas} className="block h-auto w-full" aria-hidden />
    </div>
  );
}

// ============================================================================
// App shell
// ============================================================================

function App() {
  const path = usePath();

  useEffect(() => {
    const meta = META[path];
    document.title = meta.title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", meta.description);
    window.scrollTo(0, 0);
  }, [path]);

  return (
    <>
      <div className="boot" aria-hidden="true">
        <div className="boot-mark">
          <p className="display text-5xl text-ink">Aurel</p>
          <div className="boot-rule" />
          <p className="mt-4 text-xs tracking-widest text-rose uppercase">Atelier</p>
        </div>
      </div>
      <Header />
      {path === "/" ? <Home /> : path === "/studio" ? <Studio /> : <Templates />}
      <Footer />
    </>
  );
}

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
