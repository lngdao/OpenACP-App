import React from "react"

export function SettingCard({
  title,
  children,
}: {
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      {title && (
        <h3 className="text-lg-medium text-foreground">{title}</h3>
      )}
      <div className="rounded-lg bg-muted/50 overflow-hidden">
        {children}
      </div>
    </div>
  )
}
