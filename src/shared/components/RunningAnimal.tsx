import type { RunningAnimalId } from '../appearance/runningAnimal'
import './RunningAnimal.css'

const COATS = {
  mix: { fur: '#a28a64', outline: '#55493d', paws: '#9b825e', tail: '#a28a64' },
  black: { fur: '#364052', outline: '#202838', paws: '#364052', tail: '#364052' },
  cat: { fur: '#eda45b', outline: '#77492f', paws: '#eda45b', tail: '#d58945' },
  siamese: { fur: '#eee0c6', outline: '#79665a', paws: '#69514c', tail: '#69514c' },
  dog: { fur: '#ce9a68', outline: '#71503d', paws: '#ce9a68', tail: '#ce9a68' },
  fox: { fur: '#e98b46', outline: '#824628', paws: '#694a40', tail: '#e98b46' },
  rabbit: { fur: '#e4e3ed', outline: '#7c788e', paws: '#e4e3ed', tail: '#fff8f1' },
}

export function RunningAnimal({ animal, animated = false }: { animal: RunningAnimalId; animated?: boolean }) {
  const coat = COATS[animal]
  const isCat = animal === 'cat' || animal === 'mix' || animal === 'black' || animal === 'siamese'
  return (
    <svg className={`sd-running-animal sd-running-animal--${animal}${animated ? ' sd-running-animal--animated' : ''}`} viewBox="0 0 64 40" aria-hidden="true" data-animal={animal}>
      <ellipse cx="33" cy="37" rx="23" ry="2" fill="currentColor" opacity="0.1" />
      <g className="sd-running-animal__body" fill={coat.fur} stroke={coat.outline} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
        {isCat && <path className="sd-running-animal__tail" d="M19 23C7 24 5 15 8 10C10 7 13 10 11 13C9 17 13 19 20 18" fill="none" stroke={coat.tail} strokeWidth="5" />}
        {animal === 'mix' && <g className="sd-running-animal__tail" fill="none" stroke="#4f493e" strokeWidth="2"><path d="M7 12L11 13M8 18L11 17M13 20L13 23" /></g>}
        {animal === 'dog' && <path className="sd-running-animal__tail" d="M19 23Q7 20 10 12" fill="none" stroke={coat.tail} strokeWidth="5" />}
        {animal === 'fox' && <g className="sd-running-animal__tail"><path d="M21 23Q8 30 3 14Q13 13 23 19Z" /><path d="M3 14Q6 23 11 25L10 16Z" fill="#fff0dc" stroke="none" /></g>}
        {animal === 'rabbit' && <circle cx="15" cy="23" r="5" fill={coat.tail} />}
        <g fill="none" stroke={coat.outline} strokeWidth="3.5">
          <path className="sd-running-animal__leg sd-running-animal__leg--hind sd-running-animal__leg--far" d="M23 25L20 30L23 35H27" />
          <path className="sd-running-animal__leg sd-running-animal__leg--fore sd-running-animal__leg--far" d="M43 25L45 30L42 35H46" />
        </g>
        <ellipse cx="32" cy="23" rx="17" ry="9" />
        {animal === 'cat' && <path d="M25 16L27 21M32 15L34 20M19 24L23 25" fill="none" stroke="#b87339" strokeWidth="2.5" />}
        {animal === 'mix' && <>
          <path d="M21 17L25 22M28 15L31 21M36 15L38 21M20 25L25 27M30 25L34 28" fill="none" stroke="#4f493e" strokeWidth="2.5" />
          <path d="M37 26Q43 28 47 27L45 30Q39 31 36 29Z" fill="#dfcfaf" stroke="none" />
        </>}
        {animal === 'rabbit' && <ellipse cx="25" cy="25" rx="7" ry="6" />}
        <g fill="none" stroke={coat.paws} strokeWidth="4">
          <path className="sd-running-animal__leg sd-running-animal__leg--hind" d="M23 25L19 30L21 35H25" />
          <path className="sd-running-animal__leg sd-running-animal__leg--fore" d="M43 25L41 30L44 35H48" />
        </g>
        {isCat && <>
          <path d="M40 18L39 6L47 11L54 5L57 17C62 27 54 31 47 28C40 27 37 23 40 18Z" fill={animal === 'siamese' ? coat.paws : coat.fur} />
          {animal === 'mix' && <path d="M44 12L46 17M49 11L50 16M55 13L54 16M42 20L46 21M42 24L46 24" fill="none" stroke="#4f493e" strokeWidth="2" />}
          <path d="M42 10L43 16L46 13M50 13L53 9L54 15" fill="#dcb0ab" stroke="none" />
          <path d="M46 25Q51 29 56 24" fill={animal === 'black' ? '#515b6b' : animal === 'mix' ? '#ebdcc1' : '#ffe6c3'} stroke="none" />
          <path d="M43 22L38 21M43 24L38 25" stroke={animal === 'black' ? '#aab1c0' : animal === 'mix' ? '#e2d9c3' : coat.outline} strokeWidth="1" />
        </>}
        {animal === 'dog' && <>
          <path d="M41 15Q51 10 56 19L61 21L60 26Q53 30 44 26Z" />
          <path d="M43 15Q35 11 38 25Q42 29 46 18Z" fill="#94613f" />
          <ellipse cx="59" cy="22" rx="3" ry="2" fill="#43352f" stroke="none" />
        </>}
        {animal === 'fox' && <>
          <path d="M40 18L39 6L47 12L54 6L55 19L62 23L53 29L44 27Z" />
          <path d="M43 22L53 24L61 23L53 29L45 26Z" fill="#fff0dc" stroke="none" />
          <path d="M42 11L43 16M52 11L52 16" stroke="#694a40" strokeWidth="2.5" />
        </>}
        {animal === 'rabbit' && <>
          <path d="M43 18Q36 1 40 2Q45 1 48 16Q46 0 51 2Q55 2 53 17Q61 21 57 27Q51 31 44 27Q38 24 43 18Z" />
          <path d="M41 7L45 17M50 7L50 16" stroke="#dcb0bc" strokeWidth="2.5" />
        </>}
        <circle cx="53" cy="19" r={animal === 'mix' ? '1.8' : '1.4'} fill={animal === 'black' ? '#efcf6d' : animal === 'siamese' ? '#8ecbe4' : animal === 'mix' ? '#a5c35e' : '#3e302a'} stroke="none" />
        {animal === 'mix' && <path d="M53 18L53 20" stroke="#303b24" strokeWidth="0.8" />}
        {animal !== 'dog' && <path d="M58 22L60 23L58 24" fill={animal === 'fox' ? '#43352f' : '#ba7d80'} stroke="none" />}
      </g>
    </svg>
  )
}
