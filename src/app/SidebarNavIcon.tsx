export function SidebarNavIcon({ kind }: { kind: 'overview' | 'detail' | 'ai-agent' | 'ai-work-center' | 'all-projects' | 'settings' | 'integrations' | 'github' | 'jira' | 'providers' | 'rules' | 'skills' | 'mcp' | 'theme' }) {
  switch (kind) {
    case 'overview':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 3.5C2 2.95 2.45 2.5 3 2.5H6.2L7.6 4.1H13C13.55 4.1 14 4.55 14 5.1V12.5C14 13.05 13.55 13.5 13 13.5H3C2.45 13.5 2 13.05 2 12.5V3.5Z" stroke="currentColor" strokeWidth="1.4" />
        </svg>
      )
    case 'detail':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="3" y="2" width="10" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.5 5.5H10.5M5.5 8H10.5M5.5 10.5H8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'all-projects':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="m8 1.9 1.85 3.75 4.14.6-3 2.93.71 4.13L8 11.36l-3.7 1.95.71-4.13-3-2.93 4.14-.6L8 1.9Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
        </svg>
      )
    case 'ai-work-center':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M2 8h2.2l1.3-3.2L8 11l1.8-4 1.2 1H14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="2" cy="8" r=".7" fill="currentColor" />
        </svg>
      )
    case 'ai-agent':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2V3.5M6.8 2h2.4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          <rect x="2.5" y="4" width="11" height="9" rx="2.4" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="6" cy="8" r=".8" fill="currentColor" />
          <circle cx="10" cy="8" r=".8" fill="currentColor" />
          <path d="M6 10.5h4M1.3 7v3M14.7 7v3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      )
    case 'settings':
      return (
        <svg
          className="sd-shell__icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )
    case 'integrations':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M6.5 9.5L9.5 6.5M5.2 11.8L3.8 13.2C2.8 14.2 1.8 13.2 2.8 12.2L4.2 10.8M10.8 4.2L12.2 2.8C13.2 1.8 14.2 2.8 13.2 3.8L11.8 5.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="5" cy="11" r="2" stroke="currentColor" strokeWidth="1.3" />
          <circle cx="11" cy="5" r="2" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
    case 'github':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 2.2A5.8 5.8 0 0 0 6.17 13.5c.3.06.41-.13.41-.29v-1.02c-1.67.36-2.02-.71-2.02-.71-.27-.7-.67-.89-.67-.89-.55-.38.04-.37.04-.37.61.04.93.63.93.63.54.93 1.42.66 1.76.5.05-.39.21-.66.39-.81-1.33-.15-2.73-.66-2.73-2.95 0-.65.23-1.18.62-1.6-.06-.15-.27-.76.06-1.58 0 0 .51-.16 1.66.61a5.75 5.75 0 0 1 3.02 0c1.15-.77 1.66-.61 1.66-.61.33.82.12 1.43.06 1.58.39.42.62.95.62 1.6 0 2.3-1.4 2.8-2.73 2.95.21.18.41.53.41 1.08v1.59c0 .16.11.35.41.29A5.8 5.8 0 0 0 8 2.2Z" fill="currentColor" />
        </svg>
      )
    case 'jira':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8 1.8 13.8 8 8 14.2 2.2 8 8 1.8Z" fill="currentColor" opacity=".25" />
          <path d="M8 4.1 11.6 8 8 11.9 4.4 8 8 4.1Z" stroke="currentColor" strokeWidth="1.3" />
        </svg>
      )
    case 'providers':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.5" y="3" width="11" height="10" rx="2" stroke="currentColor" strokeWidth="1.4" />
          <path d="M5.2 6.5L7.2 8L5.2 9.5M8.5 9.5H10.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )
    case 'rules':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M4 2.5H9.8L12.5 5.2V13.5H4V2.5Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M6.2 7.5H10.2M6.2 10H9.2" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'skills':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M8.5 2L3.5 9H7.8L7.2 14L12.5 7H8.2L8.5 2Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      )
    case 'mcp':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <rect x="2.5" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="9" y="2.5" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <rect x="5.75" y="9" width="4.5" height="4.5" rx="1" stroke="currentColor" strokeWidth="1.4" />
          <path d="M7 4.75H9M8 7V9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
        </svg>
      )
    case 'theme':
      return (
        <svg className="sd-shell__icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.4" />
          <circle cx="6.2" cy="6.2" r="0.9" fill="currentColor" />
          <circle cx="9.8" cy="6.2" r="0.9" fill="currentColor" />
          <circle cx="6.5" cy="9.8" r="0.9" fill="currentColor" />
        </svg>
      )
  }
}
