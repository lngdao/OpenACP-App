/**
 * OpenACP App — Entry Point
 */
import { render } from "solid-js/web"
import "../ui/src/styles/tailwind/index.css"
import "./styles.css"
import { MarkedProvider } from "../ui/src/context/marked"
import { OpenACPApp } from "./app"

const root = document.getElementById("root")
if (root) {
  render(
    () => (
      <MarkedProvider>
        <OpenACPApp />
      </MarkedProvider>
    ),
    root,
  )
}

export { OpenACPApp }
