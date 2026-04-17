import React, { useMemo } from "react"
import { MultiFileDiff } from "@pierre/diffs/react"
import type { FileContents } from "@pierre/diffs"

interface PierreDiffProps {
  oldContent: string
  newContent: string
  filePath: string
  language?: string
  style?: "unified" | "split"
}

export function PierreDiff({ oldContent, newContent, filePath, language, style = "unified" }: PierreDiffProps) {
  const oldFile: FileContents = useMemo(() => ({
    name: filePath,
    contents: oldContent,
    lang: language,
  }), [filePath, oldContent, language])

  const newFile: FileContents = useMemo(() => ({
    name: filePath,
    contents: newContent,
    lang: language,
  }), [filePath, newContent, language])

  return (
    <MultiFileDiff
      oldFile={oldFile}
      newFile={newFile}
      options={{
        diffStyle: style,
      }}
      metrics={{
        lineHeight: 20,
        hunkSeparatorHeight: 24,
        hunkLineCount: 0,
        diffHeaderHeight: 0,
        fileGap: 0,
      }}
      className="w-full select-text"
      style={{ fontSize: "12px" }}
    />
  )
}
