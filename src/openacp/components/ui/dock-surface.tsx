import React from "react"
import { cn } from "../../../lib/utils"

export function DockShell({ children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} data-dock-surface="shell" className={cn(className)}>
      {children}
    </div>
  )
}

export function DockShellForm({ children, className, ...rest }: React.FormHTMLAttributes<HTMLFormElement>) {
  return (
    <form {...rest} data-dock-surface="shell" className={cn(className)}>
      {children}
    </form>
  )
}

export interface DockTrayProps extends React.HTMLAttributes<HTMLDivElement> {
  attach?: "none" | "top"
}

export function DockTray({ attach, children, className, ...rest }: DockTrayProps) {
  return (
    <div
      {...rest}
      data-dock-surface="tray"
      data-dock-attach={attach || "none"}
      className={cn(className)}
    >
      {children}
    </div>
  )
}
