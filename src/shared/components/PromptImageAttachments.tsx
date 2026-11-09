import type { ClipboardEvent } from 'react'
import { useI18n } from '../i18n'
import type { ImageAttachment } from '../../features/projects/detail/dispatchClient'
import './PromptImageAttachments.css'

export const MAX_PROMPT_IMAGES = 3
export const MAX_PROMPT_IMAGE_BYTES = 8 * 1024 * 1024

export interface HandlePromptImagePasteOptions {
  current: ImageAttachment[]
  onChange: (next: ImageAttachment[]) => void
  onError?: (message: string) => void
  messages: {
    tooLarge: string
    maxCount: string
  }
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read image data URL'))
      }
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read image file'))
    reader.readAsDataURL(file)
  })
}

function extractClipboardImageFiles(event: ClipboardEvent<HTMLTextAreaElement>): File[] {
  const fromFiles = Array.from(event.clipboardData?.files ?? []).filter((item) =>
    item.type.startsWith('image/'),
  )
  if (fromFiles.length > 0) return fromFiles

  const fromItems = Array.from(event.clipboardData?.items ?? [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => file !== null)
  return fromItems
}

// eslint-disable-next-line react-refresh/only-export-components
export function handlePromptImagePaste(
  event: ClipboardEvent<HTMLTextAreaElement>,
  options: HandlePromptImagePasteOptions,
): void {
  const imageFiles = extractClipboardImageFiles(event)
  if (imageFiles.length === 0) return

  event.preventDefault()
  const { current, onChange, onError, messages } = options

  const remainingSlots = MAX_PROMPT_IMAGES - current.length
  if (remainingSlots <= 0) {
    onError?.(messages.maxCount)
    return
  }

  let filesToProcess = imageFiles
  if (imageFiles.length > remainingSlots) {
    filesToProcess = imageFiles.slice(0, remainingSlots)
    onError?.(messages.maxCount)
  }

  const validFiles: File[] = []
  let hasOversize = false
  for (const file of filesToProcess) {
    if (file.size > MAX_PROMPT_IMAGE_BYTES) {
      hasOversize = true
    } else {
      validFiles.push(file)
    }
  }

  if (hasOversize) {
    onError?.(messages.tooLarge)
  }
  if (validFiles.length === 0) return

  void Promise.all(
    validFiles.map(async (file, idx) => {
      const dataUrl = await readFileAsDataUrl(file)
      const fallbackIndex = current.length + idx + 1
      const ext = file.type.split('/')[1] || 'png'
      return {
        name: file.name || `pasted-image-${fallbackIndex}.${ext}`,
        mimeType: file.type,
        dataUrl,
      } satisfies ImageAttachment
    }),
  ).then((loaded) => {
    onChange([...current, ...loaded].slice(0, MAX_PROMPT_IMAGES))
  })
}

export interface PromptImageAttachmentsProps {
  attachments: ImageAttachment[]
  onRemove?: (index: number) => void
  disabled?: boolean
  readOnly?: boolean
}

export function PromptImageAttachments({
  attachments,
  onRemove,
  disabled = false,
  readOnly = false,
}: PromptImageAttachmentsProps) {
  const { t } = useI18n()

  if (readOnly && attachments.length === 0) {
    return null
  }

  return (
    <div className="sd-prompt-images">
      {!readOnly ? (
        <p className="sd-prompt-images__hint">{t('aiWork.imageAttachmentHint')}</p>
      ) : (
        <p className="sd-prompt-images__count">
          {t('aiWork.imageAttachmentCountLabel', { count: attachments.length })}
        </p>
      )}
      {attachments.length > 0 ? (
        <div className="sd-prompt-images__list" role="status">
          {attachments.map((item, index) => (
            <div key={`${item.name}-${index}`} className="sd-prompt-images__item">
              <img src={item.dataUrl} alt={item.name} />
              <span>{item.name}</span>
              {!readOnly && onRemove ? (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  disabled={disabled}
                >
                  {t('aiWork.removeImageAttachment')}
                </button>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
