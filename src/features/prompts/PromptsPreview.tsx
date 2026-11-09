import { useRef } from 'react'
import { MarkdownAnalysisOutput } from '../projects/detail/ProjectDetailArchitectureTree'
import { useI18n } from '../../shared/i18n'

function getHeadings(content: string) {
  let inFence = false
  return content.split(/\r?\n/).flatMap((line) => {
    if (line.trim().startsWith('```')) { inFence = !inFence; return [] }
    const match = !inFence && line.trim().match(/^(#{1,6})\s+(.+?)\s*#*$/)
    return match ? [{ level: match[1].length, text: match[2].replace(/[*`]/g, '') }] : []
  })
}

export function PromptsPreview({ content }: { content: string }) {
  const { t } = useI18n()
  const documentRef = useRef<HTMLDivElement>(null)
  const headings = getHeadings(content)

  return <div className="sd-prompts-document">
    {headings.length > 0 && <nav className="sd-prompts-document__outline" aria-label={t('prompts.outline')}>
      <strong>{t('prompts.outline')}</strong>
      {headings.map((heading, index) => <button key={index} type="button" className={heading.level > 2 ? 'is-subheading' : ''} onClick={() => documentRef.current?.querySelectorAll('h1, h2, h3, h4, h5, h6')[index]?.scrollIntoView({ block: 'start' })}>{heading.text}</button>)}
    </nav>}
    <div ref={documentRef} className="sd-prompts-document__body"><MarkdownAnalysisOutput markdown={content} /></div>
  </div>
}
