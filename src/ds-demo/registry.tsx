import React from "react"
import { Plus, ArrowRight, ArrowLeft, Trash, GearSix, MagnifyingGlass, PencilSimple } from "@phosphor-icons/react"
import { Button } from "../openacp/components/ui/button"
import { Badge } from "../openacp/components/ui/badge"
import { Input } from "../openacp/components/ui/input"
import { Textarea } from "../openacp/components/ui/textarea"
import { Separator } from "../openacp/components/ui/separator"
import { Skeleton } from "../openacp/components/ui/skeleton"
import { Switch } from "../openacp/components/ui/switch"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../openacp/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../openacp/components/ui/tooltip"
import {
  Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "../openacp/components/ui/dialog"
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "../openacp/components/ui/dropdown-menu"
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "../openacp/components/ui/select"
import {
  Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "../openacp/components/ui/sheet"
import { BrandLoader, BrandIcon } from "../openacp/components/brand-loader"

export interface DemoEntry {
  id: string
  name: string
  group: string
  description: string
  type: "component" | "token"
  render: () => React.ReactNode
  code?: string
  props?: { name: string; type: string; default: string }[]
}

// ── Helper ──────────────────────────────────────────────────────────────────

function ColorSwatch({ name, variable }: { name: string; variable: string }) {
  const ref = React.useRef<HTMLDivElement>(null)
  const [value, setValue] = React.useState<string>("")

  React.useEffect(() => {
    if (!ref.current) return
    const read = () => {
      const v = getComputedStyle(ref.current!).backgroundColor
      setValue(rgbToHex(v))
    }
    read()
    const observer = new MutationObserver(read)
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] })
    return () => observer.disconnect()
  }, [variable])

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      <div
        ref={ref}
        className="size-9 rounded-md border border-border-weak shrink-0"
        style={{ backgroundColor: `var(${variable})` }}
      />
      <div className="min-w-0">
        <div className="text-sm font-normal text-foreground truncate">{name}</div>
        <div className="text-2xs font-normal text-muted-foreground font-mono truncate">{variable}</div>
        <div className="text-2xs font-normal text-fg-weakest font-mono truncate">{value || "—"}</div>
      </div>
    </div>
  )
}

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/)
  if (!m) return rgb
  const parts = m[1].split(",").map((s) => s.trim())
  if (parts.length < 3) return rgb
  const [r, g, b] = parts.slice(0, 3).map((n) => parseInt(n, 10))
  const a = parts[3] !== undefined ? parseFloat(parts[3]) : 1
  if ([r, g, b].some((n) => Number.isNaN(n))) return rgb
  const hex = "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()
  return a < 1 ? `${hex} · ${Math.round(a * 100)}%` : hex
}

function ColorGroup({ title, tokens }: { title: string; tokens: [string, string][] }) {
  return (
    <div>
      <h3 className="text-base font-medium text-foreground mb-3">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {tokens.map(([name, variable]) => (
          <ColorSwatch key={variable} name={name} variable={variable} />
        ))}
      </div>
    </div>
  )
}

function ShadowBox({ name, variable }: { name: string; variable: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className="size-20 rounded-lg bg-card"
        style={{ boxShadow: `var(${variable})` }}
      />
      <span className="text-sm font-normal text-muted-foreground">{name}</span>
    </div>
  )
}

function RadiusBox({ name, className }: { name: string; className: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`size-16 bg-accent border border-border-weak ${className}`}
      />
      <span className="text-sm font-normal text-muted-foreground">{name}</span>
    </div>
  )
}

// ── Registry ────────────────────────────────────────────────────────────────

export const registry: DemoEntry[] = [
  // ── General ─────────────────────────────────────────────────────────────
  {
    id: "button",
    name: "Button",
    group: "General",
    description: "Interactive button with multiple variants and sizes.",
    type: "component",
    render: () => (
      <div className="space-y-8">
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Variants</div>
          <div className="flex flex-wrap gap-3">
            <Button variant="default">Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="link">Link</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Sizes</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="xs">Extra Small</Button>
            <Button size="sm">Small</Button>
            <Button size="default">Default</Button>
            <Button size="lg">Large</Button>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Icon sizes</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="icon-xs">X</Button>
            <Button size="icon-sm">S</Button>
            <Button size="icon-md">M</Button>
            <Button size="icon-lg">L</Button>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">With icons</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button><Plus /> Create New</Button>
            <Button variant="outline"><MagnifyingGlass /> Search</Button>
            <Button variant="secondary">Next <ArrowRight /></Button>
            <Button variant="ghost"><ArrowLeft /> Back</Button>
            <Button variant="destructive"><Trash /> Delete</Button>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Icon only — all sizes</div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-xs" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-xs<br/>24px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-sm" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-sm<br/>32px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-md" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-md<br/>36px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <Button size="icon-lg" variant="outline"><Plus /></Button>
              <span className="text-[10px] text-muted-foreground">icon-lg<br/>40px</span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Icon only — variants</div>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="icon-md" variant="default"><Plus /></Button>
            <Button size="icon-md" variant="secondary"><GearSix /></Button>
            <Button size="icon-md" variant="outline"><PencilSimple /></Button>
            <Button size="icon-md" variant="ghost"><MagnifyingGlass /></Button>
            <Button size="icon-md" variant="destructive"><Trash /></Button>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">States</div>
          <div className="flex flex-wrap gap-3">
            <Button>Enabled</Button>
            <Button disabled>Disabled</Button>
            <Button disabled><Plus /> Disabled with icon</Button>
          </div>
        </div>
      </div>
    ),
    code: `import { Button } from "@/components/ui/button"
import { Plus, ArrowRight, Trash } from "@phosphor-icons/react"

// Text only
<Button variant="default">Click me</Button>

// Icon before text
<Button><Plus /> Create New</Button>

// Icon after text
<Button variant="secondary">Next <ArrowRight /></Button>

// Icon only
<Button size="icon-md" variant="outline"><Trash /></Button>`,
    props: [
      { name: "variant", type: '"default" | "secondary" | "outline" | "ghost" | "link" | "destructive"', default: '"default"' },
      { name: "size", type: '"default" | "xs" | "sm" | "lg" | "icon" | "icon-xs" | "icon-sm" | "icon-lg"', default: '"default"' },
      { name: "asChild", type: "boolean", default: "false" },
      { name: "disabled", type: "boolean", default: "false" },
    ],
  },
  {
    id: "badge",
    name: "Badge",
    group: "General",
    description: "Small status indicator with variants.",
    type: "component",
    render: () => (
      <div className="flex flex-wrap gap-2">
        <Badge variant="default">Default</Badge>
        <Badge variant="secondary">Secondary</Badge>
        <Badge variant="outline">Outline</Badge>
        <Badge variant="destructive">Destructive</Badge>
      </div>
    ),
    code: `import { Badge } from "@/components/ui/badge"

<Badge variant="default">Status</Badge>`,
    props: [
      { name: "variant", type: '"default" | "secondary" | "outline" | "destructive"', default: '"default"' },
    ],
  },
  {
    id: "input",
    name: "Input",
    group: "General",
    description: "Text input field.",
    type: "component",
    render: () => (
      <div className="space-y-3 max-w-sm">
        <Input placeholder="Default input" />
        <Input placeholder="Disabled" disabled />
        <Input type="password" placeholder="Password" />
      </div>
    ),
    code: `import { Input } from "@/components/ui/input"

<Input placeholder="Enter text..." />`,
    props: [
      { name: "type", type: "string", default: '"text"' },
      { name: "placeholder", type: "string", default: '""' },
      { name: "disabled", type: "boolean", default: "false" },
    ],
  },
  {
    id: "textarea",
    name: "Textarea",
    group: "General",
    description: "Multi-line text input.",
    type: "component",
    render: () => (
      <div className="max-w-sm">
        <Textarea placeholder="Type your message here..." />
      </div>
    ),
    code: `import { Textarea } from "@/components/ui/textarea"

<Textarea placeholder="Type here..." />`,
  },
  {
    id: "separator",
    name: "Separator",
    group: "General",
    description: "Visual divider between content sections.",
    type: "component",
    render: () => (
      <div className="space-y-4">
        <div className="text-base font-normal text-foreground">Above separator</div>
        <Separator />
        <div className="text-base font-normal text-foreground">Below separator</div>
        <div className="flex items-center gap-4 h-5">
          <span className="text-base font-normal">Left</span>
          <Separator orientation="vertical" />
          <span className="text-base font-normal">Right</span>
        </div>
      </div>
    ),
    code: `import { Separator } from "@/components/ui/separator"

<Separator />
<Separator orientation="vertical" />`,
  },
  {
    id: "skeleton",
    name: "Skeleton",
    group: "General",
    description: "Loading placeholder animation.",
    type: "component",
    render: () => (
      <div className="flex items-center gap-4">
        <Skeleton className="size-12 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-[250px]" />
          <Skeleton className="h-4 w-[200px]" />
        </div>
      </div>
    ),
    code: `import { Skeleton } from "@/components/ui/skeleton"

<Skeleton className="h-4 w-[200px]" />`,
  },

  {
    id: "brand-loader",
    name: "Brand Loader",
    group: "General",
    description: "Branded loading indicator using the OpenACP octopus symbol.",
    type: "component",
    render: () => (
      <div className="space-y-10">
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">Animation styles</div>
          <p className="text-sm leading-relaxed text-fg-weakest mb-4">Pick an animation for the octopus loader.</p>
          <div className="grid grid-cols-4 gap-5">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-wobble" />
              <div className="text-sm font-medium text-foreground">Wobble</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-wobble</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-jelly" />
              <div className="text-sm font-medium text-foreground">Jelly</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-jelly</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-swim" />
              <div className="text-sm font-medium text-foreground">Swim</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-swim</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-bounce-squash" />
              <div className="text-sm font-medium text-foreground">Bounce</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-bounce-squash</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-breathe" />
              <div className="text-sm font-medium text-foreground">Breathe</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-breathe</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-float" />
              <div className="text-sm font-medium text-foreground">Float</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-float</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 text-muted-foreground animate-pulse-glow" />
              <div className="text-sm font-medium text-foreground">Pulse Glow</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-pulse-glow</code>
            </div>
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border p-5">
              <BrandIcon className="w-10 h-7 animate-color-cycle" />
              <div className="text-sm font-medium text-foreground">Color Cycle</div>
              <code className="text-2xs font-normal text-muted-foreground">animate-color-cycle</code>
            </div>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-3">BrandLoader — with label</div>
          <div className="flex items-center gap-8">
            <BrandLoader label="Connecting..." />
            <BrandLoader label="Loading sessions..." />
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-3">Inline sizes</div>
          <div className="flex items-center gap-5">
            <div className="flex flex-col items-center gap-1">
              <BrandIcon className="size-3 text-muted-foreground animate-breathe" />
              <span className="text-2xs font-normal text-fg-weakest">12px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <BrandIcon className="size-4 text-muted-foreground animate-breathe" />
              <span className="text-2xs font-normal text-fg-weakest">16px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <BrandIcon className="size-6 text-muted-foreground animate-breathe" />
              <span className="text-2xs font-normal text-fg-weakest">24px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <BrandIcon className="size-8 text-muted-foreground animate-breathe" />
              <span className="text-2xs font-normal text-fg-weakest">32px</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <BrandIcon className="w-12 h-8 text-muted-foreground animate-breathe" />
              <span className="text-2xs font-normal text-fg-weakest">48x32</span>
            </div>
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-3">Static (no animation)</div>
          <div className="flex items-center gap-4">
            <BrandIcon className="size-4 text-foreground" />
            <BrandIcon className="size-6 text-muted-foreground" />
            <BrandIcon className="size-8 text-fg-weakest" />
          </div>
        </div>
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-3">Context — Sidebar session loading</div>
          <div className="w-64 rounded-lg border border-border bg-card p-3 space-y-2">
            <div className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-secondary">
              <BrandIcon className="size-[15px] text-muted-foreground animate-breathe" />
              <span className="text-base leading-relaxed text-foreground truncate">Creating session...</span>
            </div>
            <div className="flex items-center gap-2 px-2 py-1.5">
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
                <path d="M5 10H15" stroke="currentColor" strokeLinecap="round" className="text-muted-foreground" />
              </svg>
              <span className="text-base leading-relaxed text-foreground truncate">Regular session</span>
            </div>
          </div>
        </div>
      </div>
    ),
    code: `import { BrandLoader, BrandIcon } from "@/components/brand-loader"

// Full loader with label
<BrandLoader label="Connecting..." />

// Inline icon — pick an animation class:
//   animate-breathe     scale pulse (default)
//   animate-float       gentle vertical bob
//   animate-pulse-glow  opacity + glow
//   animate-color-cycle cycle through theme colors
<BrandIcon className="size-[15px] text-muted-foreground animate-breathe" />

// Static icon (no animation)
<BrandIcon className="size-6 text-foreground" />`,
    props: [
      { name: "className", type: "string", default: '—' },
      { name: "label", type: "string (BrandLoader only)", default: '—' },
    ],
  },

  // ── Overlay ─────────────────────────────────────────────────────────────
  {
    id: "dialog",
    name: "Dialog",
    group: "Overlay",
    description: "Modal dialog overlay.",
    type: "component",
    render: () => (
      <Dialog>
        <DialogTrigger asChild>
          <Button variant="outline">Open Dialog</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dialog Title</DialogTitle>
            <DialogDescription>This is a dialog description.</DialogDescription>
          </DialogHeader>
          <div className="text-base font-normal text-fg-weak py-4">Dialog body content goes here.</div>
        </DialogContent>
      </Dialog>
    ),
    code: `import { Dialog, DialogTrigger, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"

<Dialog>
  <DialogTrigger asChild>
    <Button>Open</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Title</DialogTitle>
    </DialogHeader>
  </DialogContent>
</Dialog>`,
  },
  {
    id: "dropdown-menu",
    name: "DropdownMenu",
    group: "Overlay",
    description: "Contextual menu triggered by a button.",
    type: "component",
    render: () => (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline">Open Menu</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Profile</DropdownMenuItem>
          <DropdownMenuItem>Settings</DropdownMenuItem>
          <DropdownMenuItem>Logout</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    ),
    code: `import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu"

<DropdownMenu>
  <DropdownMenuTrigger asChild>
    <Button>Menu</Button>
  </DropdownMenuTrigger>
  <DropdownMenuContent>
    <DropdownMenuItem>Item</DropdownMenuItem>
  </DropdownMenuContent>
</DropdownMenu>`,
  },
  {
    id: "sheet",
    name: "Sheet",
    group: "Overlay",
    description: "Slide-out panel from the edge of the screen.",
    type: "component",
    render: () => (
      <Sheet>
        <SheetTrigger asChild>
          <Button variant="outline">Open Sheet</Button>
        </SheetTrigger>
        <SheetContent>
          <SheetHeader>
            <SheetTitle>Sheet Title</SheetTitle>
            <SheetDescription>Sheet description goes here.</SheetDescription>
          </SheetHeader>
        </SheetContent>
      </Sheet>
    ),
    code: `import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"

<Sheet>
  <SheetTrigger asChild>
    <Button>Open</Button>
  </SheetTrigger>
  <SheetContent>
    <SheetHeader>
      <SheetTitle>Title</SheetTitle>
    </SheetHeader>
  </SheetContent>
</Sheet>`,
  },
  {
    id: "tooltip",
    name: "Tooltip",
    group: "Overlay",
    description: "Popup hint on hover.",
    type: "component",
    render: () => (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline">Hover me</Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Tooltip content</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ),
    code: `import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

<TooltipProvider>
  <Tooltip>
    <TooltipTrigger>Hover</TooltipTrigger>
    <TooltipContent>Content</TooltipContent>
  </Tooltip>
</TooltipProvider>`,
  },
  {
    id: "select",
    name: "Select",
    group: "Overlay",
    description: "Dropdown selection control.",
    type: "component",
    render: () => (
      <div className="max-w-sm">
        <Select>
          <SelectTrigger>
            <SelectValue placeholder="Select option" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="a">Option A</SelectItem>
            <SelectItem value="b">Option B</SelectItem>
            <SelectItem value="c">Option C</SelectItem>
          </SelectContent>
        </Select>
      </div>
    ),
    code: `import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select"

<Select>
  <SelectTrigger>
    <SelectValue placeholder="Pick..." />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="a">A</SelectItem>
  </SelectContent>
</Select>`,
  },

  // ── Navigation ──────────────────────────────────────────────────────────
  {
    id: "tabs",
    name: "Tabs",
    group: "Navigation",
    description: "Tabbed navigation between content panels.",
    type: "component",
    render: () => (
      <Tabs defaultValue="tab1">
        <TabsList>
          <TabsTrigger value="tab1">Tab 1</TabsTrigger>
          <TabsTrigger value="tab2">Tab 2</TabsTrigger>
          <TabsTrigger value="tab3">Tab 3</TabsTrigger>
        </TabsList>
        <TabsContent value="tab1" className="text-base font-normal text-fg-weak p-4">Content for Tab 1</TabsContent>
        <TabsContent value="tab2" className="text-base font-normal text-fg-weak p-4">Content for Tab 2</TabsContent>
        <TabsContent value="tab3" className="text-base font-normal text-fg-weak p-4">Content for Tab 3</TabsContent>
      </Tabs>
    ),
    code: `import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

<Tabs defaultValue="tab1">
  <TabsList>
    <TabsTrigger value="tab1">Tab 1</TabsTrigger>
  </TabsList>
  <TabsContent value="tab1">Content</TabsContent>
</Tabs>`,
  },

  // ── Data Display ────────────────────────────────────────────────────────
  {
    id: "switch",
    name: "Switch",
    group: "Data Display",
    description: "Toggle switch for on/off states.",
    type: "component",
    render: () => (
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Switch id="s1" />
          <label htmlFor="s1" className="text-base font-normal text-foreground">Default</label>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="s2" defaultChecked />
          <label htmlFor="s2" className="text-base font-normal text-foreground">Checked</label>
        </div>
        <div className="flex items-center gap-3">
          <Switch id="s3" disabled />
          <label htmlFor="s3" className="text-base font-normal text-muted-foreground">Disabled</label>
        </div>
      </div>
    ),
    code: `import { Switch } from "@/components/ui/switch"

<Switch />`,
  },

  // ── Tokens ──────────────────────────────────────────────────────────────
  {
    id: "colors",
    name: "Colors",
    group: "Tokens",
    description: "Full color token catalog — shadcn aliases + semantic surface, text, border, icon, button, syntax, markdown, and avatar tokens.",
    type: "token",
    render: () => (
      <div className="space-y-10">
        <ColorGroup
          title="shadcn — Core"
          tokens={[
            ["Background", "--background"],
            ["Background Weak", "--background-weak"],
            ["Foreground", "--foreground"],
            ["Card", "--card"],
            ["Card Foreground", "--card-foreground"],
            ["Popover", "--popover"],
            ["Popover Foreground", "--popover-foreground"],
          ]}
        />
        <ColorGroup
          title="shadcn — Semantic"
          tokens={[
            ["Primary", "--primary"],
            ["Primary Foreground", "--primary-foreground"],
            ["Secondary", "--secondary"],
            ["Secondary Foreground", "--secondary-foreground"],
            ["Muted", "--muted"],
            ["Muted Foreground", "--muted-foreground"],
            ["Accent", "--accent"],
            ["Accent Foreground", "--accent-foreground"],
            ["Destructive", "--destructive"],
            ["Destructive Foreground", "--destructive-foreground"],
          ]}
        />
        <ColorGroup
          title="shadcn — Form"
          tokens={[
            ["Border", "--border"],
            ["Border Weak", "--border-weak"],
            ["Input", "--input"],
            ["Ring", "--ring"],
            ["Foreground Weak", "--fg-weak"],
            ["Foreground Weaker", "--fg-weakest"],
          ]}
        />
        <ColorGroup
          title="Sidebar"
          tokens={[
            ["Background", "--sidebar-background"],
            ["Foreground", "--sidebar-foreground"],
            ["Primary", "--sidebar-primary"],
            ["Primary Foreground", "--sidebar-primary-foreground"],
            ["Accent", "--sidebar-accent"],
            ["Accent Foreground", "--sidebar-accent-foreground"],
            ["Border", "--sidebar-border"],
            ["Ring", "--sidebar-ring"],
          ]}
        />
        <ColorGroup
          title="Surface — base"
          tokens={[
            ["Base", "--surface-base"],
            ["Base Hover", "--surface-base-hover"],
            ["Base Active", "--surface-base-active"],
            ["Base Interactive Active", "--surface-base-interactive-active"],
            ["Weak", "--surface-weak"],
            ["Weaker", "--surface-weaker"],
            ["Strong", "--surface-strong"],
          ]}
        />
        <ColorGroup
          title="Surface — raised / float / inset"
          tokens={[
            ["Raised Base", "--surface-raised-base"],
            ["Raised Base Hover", "--surface-raised-base-hover"],
            ["Raised Base Active", "--surface-raised-base-active"],
            ["Raised Strong", "--surface-raised-strong"],
            ["Raised Strong Hover", "--surface-raised-strong-hover"],
            ["Raised Stronger", "--surface-raised-stronger"],
            ["Raised Stronger Hover", "--surface-raised-stronger-hover"],
            ["Float Base", "--surface-float-base"],
            ["Float Base Hover", "--surface-float-base-hover"],
            ["Inset Base", "--surface-inset-base"],
            ["Inset Base Hover", "--surface-inset-base-hover"],
            ["Inset Strong", "--surface-inset-strong"],
            ["Inset Strong Hover", "--surface-inset-strong-hover"],
          ]}
        />
        <ColorGroup
          title="Surface — semantic"
          tokens={[
            ["Brand Base", "--surface-brand-base"],
            ["Brand Hover", "--surface-brand-hover"],
            ["Interactive Base", "--surface-interactive-base"],
            ["Interactive Hover", "--surface-interactive-hover"],
            ["Interactive Weak", "--surface-interactive-weak"],
            ["Interactive Weak Hover", "--surface-interactive-weak-hover"],
            ["Success Base", "--surface-success-base"],
            ["Success Weak", "--surface-success-weak"],
            ["Success Strong", "--surface-success-strong"],
            ["Warning Base", "--surface-warning-base"],
            ["Warning Weak", "--surface-warning-weak"],
            ["Warning Strong", "--surface-warning-strong"],
            ["Critical Base", "--surface-critical-base"],
            ["Critical Weak", "--surface-critical-weak"],
            ["Critical Strong", "--surface-critical-strong"],
            ["Info Base", "--surface-info-base"],
            ["Info Weak", "--surface-info-weak"],
            ["Info Strong", "--surface-info-strong"],
          ]}
        />
        <ColorGroup
          title="Surface — diff"
          tokens={[
            ["Unchanged", "--surface-diff-unchanged-base"],
            ["Skip", "--surface-diff-skip-base"],
            ["Hidden Base", "--surface-diff-hidden-base"],
            ["Hidden Weak", "--surface-diff-hidden-weak"],
            ["Hidden Weaker", "--surface-diff-hidden-weaker"],
            ["Hidden Strong", "--surface-diff-hidden-strong"],
            ["Hidden Stronger", "--surface-diff-hidden-stronger"],
            ["Add Base", "--surface-diff-add-base"],
            ["Add Weak", "--surface-diff-add-weak"],
            ["Add Weaker", "--surface-diff-add-weaker"],
            ["Add Strong", "--surface-diff-add-strong"],
            ["Add Stronger", "--surface-diff-add-stronger"],
            ["Delete Base", "--surface-diff-delete-base"],
            ["Delete Weak", "--surface-diff-delete-weak"],
            ["Delete Weaker", "--surface-diff-delete-weaker"],
            ["Delete Strong", "--surface-diff-delete-strong"],
            ["Delete Stronger", "--surface-diff-delete-stronger"],
          ]}
        />
        <ColorGroup
          title="Input states"
          tokens={[
            ["Base", "--input-base"],
            ["Hover", "--input-hover"],
            ["Active", "--input-active"],
            ["Selected", "--input-selected"],
            ["Focus", "--input-focus"],
            ["Disabled", "--input-disabled"],
          ]}
        />
        <ColorGroup
          title="Text — scale"
          tokens={[
            ["Base", "--color-text-base"],
            ["Weak", "--color-text-weak"],
            ["Weaker", "--color-text-weaker"],
            ["Strong", "--color-text-strong"],
            ["Stronger", "--color-text-stronger"],
            ["Invert Base", "--color-text-invert-base"],
            ["Invert Weak", "--color-text-invert-weak"],
            ["Invert Weaker", "--color-text-invert-weaker"],
            ["Invert Strong", "--color-text-invert-strong"],
          ]}
        />
        <ColorGroup
          title="Text — on semantic"
          tokens={[
            ["Interactive", "--color-text-interactive-base"],
            ["On Interactive", "--color-text-on-interactive-base"],
            ["On Interactive Weak", "--color-text-on-interactive-weak"],
            ["On Brand Base", "--color-text-on-brand-base"],
            ["On Brand Weak", "--color-text-on-brand-weak"],
            ["On Brand Weaker", "--color-text-on-brand-weaker"],
            ["On Brand Strong", "--color-text-on-brand-strong"],
            ["On Success Base", "--color-text-on-success-base"],
            ["On Success Weak", "--color-text-on-success-weak"],
            ["On Success Strong", "--color-text-on-success-strong"],
            ["On Warning Base", "--color-text-on-warning-base"],
            ["On Warning Weak", "--color-text-on-warning-weak"],
            ["On Warning Strong", "--color-text-on-warning-strong"],
            ["On Critical Base", "--color-text-on-critical-base"],
            ["On Critical Weak", "--color-text-on-critical-weak"],
            ["On Critical Strong", "--color-text-on-critical-strong"],
            ["On Info Base", "--color-text-on-info-base"],
            ["On Info Weak", "--color-text-on-info-weak"],
            ["On Info Strong", "--color-text-on-info-strong"],
          ]}
        />
        <ColorGroup
          title="Text — diff"
          tokens={[
            ["Add Base", "--color-text-diff-add-base"],
            ["Add Strong", "--color-text-diff-add-strong"],
            ["Delete Base", "--color-text-diff-delete-base"],
            ["Delete Strong", "--color-text-diff-delete-strong"],
          ]}
        />
        <ColorGroup
          title="Border — base"
          tokens={[
            ["Base", "--border-base"],
            ["Hover", "--border-hover"],
            ["Active", "--border-active"],
            ["Selected", "--border-selected"],
            ["Disabled", "--border-disabled"],
            ["Focus", "--border-focus"],
          ]}
        />
        <ColorGroup
          title="Border — strong / weak / weaker"
          tokens={[
            ["Strong Base", "--border-strong-base"],
            ["Strong Hover", "--border-strong-hover"],
            ["Strong Selected", "--border-strong-selected"],
            ["Weak Base", "--border-weak-base"],
            ["Weak Hover", "--border-weak-hover"],
            ["Weak Selected", "--border-weak-selected"],
            ["Weaker Base", "--border-weaker-base"],
            ["Weaker Hover", "--border-weaker-hover"],
            ["Weaker Selected", "--border-weaker-selected"],
          ]}
        />
        <ColorGroup
          title="Border — semantic"
          tokens={[
            ["Interactive Base", "--border-interactive-base"],
            ["Interactive Hover", "--border-interactive-hover"],
            ["Interactive Active", "--border-interactive-active"],
            ["Interactive Selected", "--border-interactive-selected"],
            ["Success Base", "--border-success-base"],
            ["Success Hover", "--border-success-hover"],
            ["Success Selected", "--border-success-selected"],
            ["Warning Base", "--border-warning-base"],
            ["Warning Hover", "--border-warning-hover"],
            ["Warning Selected", "--border-warning-selected"],
            ["Critical Base", "--border-critical-base"],
            ["Critical Hover", "--border-critical-hover"],
            ["Critical Selected", "--border-critical-selected"],
            ["Info Base", "--border-info-base"],
            ["Info Hover", "--border-info-hover"],
            ["Info Selected", "--border-info-selected"],
          ]}
        />
        <ColorGroup
          title="Icon — base / strong / weak"
          tokens={[
            ["Base", "--icon-base"],
            ["Hover", "--icon-hover"],
            ["Active", "--icon-active"],
            ["Selected", "--icon-selected"],
            ["Disabled", "--icon-disabled"],
            ["Focus", "--icon-focus"],
            ["Strong Base", "--icon-strong-base"],
            ["Strong Hover", "--icon-strong-hover"],
            ["Strong Active", "--icon-strong-active"],
            ["Weak Base", "--icon-weak-base"],
            ["Weak Hover", "--icon-weak-hover"],
            ["Weak Active", "--icon-weak-active"],
            ["Invert Base", "--icon-invert-base"],
          ]}
        />
        <ColorGroup
          title="Icon — semantic"
          tokens={[
            ["Brand", "--icon-brand-base"],
            ["Interactive", "--icon-interactive-base"],
            ["Success Base", "--icon-success-base"],
            ["Success Hover", "--icon-success-hover"],
            ["Success Active", "--icon-success-active"],
            ["Warning Base", "--icon-warning-base"],
            ["Warning Hover", "--icon-warning-hover"],
            ["Warning Active", "--icon-warning-active"],
            ["Critical Base", "--icon-critical-base"],
            ["Critical Hover", "--icon-critical-hover"],
            ["Critical Active", "--icon-critical-active"],
            ["Info Base", "--icon-info-base"],
            ["Info Hover", "--icon-info-hover"],
            ["Info Active", "--icon-info-active"],
          ]}
        />
        <ColorGroup
          title="Icon — on semantic"
          tokens={[
            ["On Interactive", "--icon-on-interactive-base"],
            ["On Brand Base", "--icon-on-brand-base"],
            ["On Brand Hover", "--icon-on-brand-hover"],
            ["On Success Base", "--icon-on-success-base"],
            ["On Success Hover", "--icon-on-success-hover"],
            ["On Warning Base", "--icon-on-warning-base"],
            ["On Warning Hover", "--icon-on-warning-hover"],
            ["On Critical Base", "--icon-on-critical-base"],
            ["On Critical Hover", "--icon-on-critical-hover"],
            ["On Info Base", "--icon-on-info-base"],
            ["On Info Hover", "--icon-on-info-hover"],
          ]}
        />
        <ColorGroup
          title="Icon — agent"
          tokens={[
            ["Plan", "--icon-agent-plan-base"],
            ["Docs", "--icon-agent-docs-base"],
            ["Ask", "--icon-agent-ask-base"],
            ["Build", "--icon-agent-build-base"],
          ]}
        />
        <ColorGroup
          title="Icon — diff"
          tokens={[
            ["Add Base", "--icon-diff-add-base"],
            ["Add Hover", "--icon-diff-add-hover"],
            ["Delete Base", "--icon-diff-delete-base"],
            ["Delete Hover", "--icon-diff-delete-hover"],
            ["Modified", "--icon-diff-modified-base"],
          ]}
        />
        <ColorGroup
          title="Button"
          tokens={[
            ["Primary Base", "--button-primary-base"],
            ["Secondary Base", "--button-secondary-base"],
            ["Secondary Hover", "--button-secondary-hover"],
            ["Ghost Hover", "--button-ghost-hover"],
            ["Ghost Hover 2", "--button-ghost-hover2"],
          ]}
        />
        <ColorGroup
          title="Syntax"
          tokens={[
            ["Comment", "--syntax-comment"],
            ["Regexp", "--syntax-regexp"],
            ["String", "--syntax-string"],
            ["Keyword", "--syntax-keyword"],
            ["Primitive", "--syntax-primitive"],
            ["Operator", "--syntax-operator"],
            ["Variable", "--syntax-variable"],
            ["Property", "--syntax-property"],
            ["Type", "--syntax-type"],
            ["Constant", "--syntax-constant"],
            ["Punctuation", "--syntax-punctuation"],
            ["Object", "--syntax-object"],
            ["Success", "--syntax-success"],
            ["Warning", "--syntax-warning"],
            ["Critical", "--syntax-critical"],
            ["Info", "--syntax-info"],
            ["Diff Add", "--syntax-diff-add"],
            ["Diff Delete", "--syntax-diff-delete"],
          ]}
        />
        <ColorGroup
          title="Markdown"
          tokens={[
            ["Heading", "--markdown-heading"],
            ["Text", "--markdown-text"],
            ["Link", "--markdown-link"],
            ["Link Text", "--markdown-link-text"],
            ["Code", "--markdown-code"],
            ["Block Quote", "--markdown-block-quote"],
            ["Emph", "--markdown-emph"],
            ["Strong", "--markdown-strong"],
            ["Horizontal Rule", "--markdown-horizontal-rule"],
            ["List Item", "--markdown-list-item"],
            ["List Enumeration", "--markdown-list-enumeration"],
            ["Image", "--markdown-image"],
            ["Image Text", "--markdown-image-text"],
            ["Code Block", "--markdown-code-block"],
          ]}
        />
        <div>
          <h3 className="text-base font-medium text-foreground mb-3">Avatar — paired bg + text</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {["pink", "mint", "orange", "purple", "cyan", "lime"].map((c) => (
              <div key={c} className="flex items-center gap-3 min-w-0">
                <div
                  className="size-9 rounded-full flex items-center justify-center text-sm font-medium shrink-0"
                  style={{ background: `var(--avatar-background-${c})`, color: `var(--avatar-text-${c})` }}
                >
                  {c[0].toUpperCase()}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-normal text-foreground capitalize truncate">{c}</div>
                  <div className="text-2xs font-normal text-muted-foreground font-mono truncate">--avatar-*-{c}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "typography",
    name: "Typography",
    group: "Tokens",
    description: "Font families, sizes, weights, and line heights.",
    type: "token",
    render: () => (
      <div className="space-y-6">
        <div>
          <h3 className="text-base font-medium text-foreground mb-3">Font Families</h3>
          <div className="space-y-2">
            <p style={{ fontFamily: "var(--font-family-sans)" }} className="text-foreground">Sans — The quick brown fox jumps over the lazy dog</p>
            <p style={{ fontFamily: "var(--font-family-mono)" }} className="text-foreground">Mono — The quick brown fox jumps over the lazy dog</p>
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium text-foreground mb-3">Text Utilities</h3>
          <div className="space-y-3">
            <div className="text-xl font-medium text-foreground">text-xl font-medium — Heading</div>
            <div className="text-lg font-medium text-foreground">text-lg font-medium — Subheading</div>
            <div className="text-base font-medium text-foreground">text-base font-medium — Label</div>
            <div className="text-base font-normal text-foreground">text-base font-normal — Body</div>
            <div className="text-sm font-medium text-foreground">text-sm font-medium — Caption bold</div>
            <div className="text-sm font-normal text-foreground">text-sm font-normal — Caption</div>
          </div>
        </div>
        <div>
          <h3 className="text-base font-medium text-foreground mb-3">Foreground Scale</h3>
          <div className="space-y-2">
            <p className="text-base font-normal text-foreground">Foreground — primary text</p>
            <p className="text-base font-normal text-fg-weak">Foreground Weak — secondary text</p>
            <p className="text-base font-normal text-muted-foreground">Muted Foreground — muted text</p>
            <p className="text-base font-normal text-fg-weakest">Foreground Weaker — weakest text</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    id: "spacing",
    name: "Spacing",
    group: "Tokens",
    description: "Spacing scale based on 0.25rem (4px) increments.",
    type: "token",
    render: () => (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6, 8, 10, 12, 16].map((n) => (
          <div key={n} className="flex items-center gap-4">
            <span className="text-sm font-normal text-muted-foreground font-mono w-8 text-right">{n}</span>
            <div className="bg-primary rounded-sm" style={{ width: `${n * 4}px`, height: "16px" }} />
            <span className="text-sm font-normal text-fg-weakest">{n * 4}px / {n * 0.25}rem</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: "shadows",
    name: "Shadows",
    group: "Tokens",
    description: "Shadow tokens for elevation.",
    type: "token",
    render: () => (
      <div className="flex flex-wrap gap-8">
        <ShadowBox name="xs" variable="--shadow-xs" />
        <ShadowBox name="md" variable="--shadow-md" />
        <ShadowBox name="lg" variable="--shadow-lg" />
      </div>
    ),
  },
  {
    id: "radius",
    name: "Radius",
    group: "Tokens",
    description: "Border radius tokens.",
    type: "token",
    render: () => (
      <div className="flex flex-wrap gap-6">
        <RadiusBox name="xs" className="rounded-xs" />
        <RadiusBox name="sm" className="rounded-sm" />
        <RadiusBox name="md" className="rounded-md" />
        <RadiusBox name="lg" className="rounded-lg" />
        <RadiusBox name="xl" className="rounded-xl" />
        <RadiusBox name="2xl" className="rounded-2xl" />
        <RadiusBox name="full" className="rounded-full" />
      </div>
    ),
  },
]
