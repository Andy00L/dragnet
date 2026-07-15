// The Dragnet warm-paper token sheet, mirrored from docs/UI_DESIGN_SYSTEM.md and
// ui-design/palette.html so components read named tokens instead of loose hex
// literals. The same values are exposed as CSS variables in app/globals.css; this
// object is for the inline styles that carry dynamic, state-driven values (net
// widths, status colours, animation delays) where a class cannot.
export const palette = {
  paper: "#ECE6D8",
  surface: "#F4EFE3",
  well: "#E4DDCC",
  ink: "#22201B",
  muted: "#6E6656",
  faint: "#A79D89",
  accent: "#1F5B52",
  accentSoft: "#D7E2DB",
  accentDeep: "#16443E",
  paid: "#3E7B4F",
  paidSoft: "#DCE7DA",
  pending: "#B07A24",
  pendingSoft: "#EDE2C7",
  error: "#A83A2B",
  errorSoft: "#EEDAD3",
  errorEdge: "#DFC3B9",
  edge: "#D9D1BE",
  highlight: "#FCF8EF",
} as const;

export type StatusName = "Open" | "Paid" | "Refunded" | "Slashed";

// One typographic colour per status word (never a tinted pill): the accent for a
// live sweep, the reserved paid green, ochre for a refund, error red for a slash.
export const statusColor: Record<StatusName, string> = {
  Open: palette.accent,
  Paid: palette.paid,
  Refunded: palette.pending,
  Slashed: palette.error,
};
