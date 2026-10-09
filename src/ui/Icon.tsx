// Ícones em traço (24×24), desenhados para o app. Herdam a cor do texto.
const PATHS: Record<string, string> = {
  home: 'M3 11.5 12 4l9 7.5M5.5 9.5V20h5v-6h3v6h5V9.5',
  obra: 'M3 20h18M5 20V9l7-5 7 5v11M9 20v-6h6v6M9 10h.01M15 10h.01',
  diario: 'M6 3h10l3 3v15H6zM9 9h7M9 13h7M9 17h4M16 3v3h3',
  aprovar: 'M9 12.5l2 2 4-4.5M12 3l7 3v6c0 4.5-3 7.6-7 9-4-1.4-7-4.5-7-9V6z',
  alerta: 'M12 4 2.5 20h19zM12 10v4.5M12 17.2v.3',
  relatorio: 'M6 3h9l4 4v14H6zM9 17v-3M12.5 17v-6M16 17v-4',
  equipe: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.6-3.4 3.2-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.2a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .7 3.2 2.5 3.5 5.2',
  config: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z',
  historico: 'M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3.5 2',
  sino: 'M18 16v-5a6 6 0 1 0-12 0v5l-2 2h16zM10 21h4',
  mais: 'M12 5v14M5 12h14',
  menu: 'M4 6h16M4 12h16M4 18h16',
  fechar: 'M6 6l12 12M18 6 6 18',
  voltar: 'M15 5l-7 7 7 7',
  avancar: 'M9 5l7 7-7 7',
  editar: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  sair: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h11',
  busca: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM16 16l5 5',
  calendario: 'M4 6h16v15H4zM4 10h16M8 3v4M16 3v4',
  foto: 'M4 7h3l2-3h6l2 3h3v13H4zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  arquivo: 'M4 7h6l2 2h8v11H4z',
  ok: 'M5 12.5l4.5 4.5L19 7.5',
  usuario: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.8-4 3.9-6.5 8-6.5s7.2 2.5 8 6.5',
  empresa: 'M4 21V5l8-2v18M12 8h8v13M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2',
  cadeado: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  arquivar: 'M3 4h18v4H3zM5 8v12h14V8M10 12h4',
  filtro: 'M3 5h18l-7 8v6l-4 2v-8z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 11v5M12 8v.2',
}

export type IconName = keyof typeof PATHS

export function Icon({ name, size = 20, title, className }: { name: IconName; size?: number; title?: string; className?: string }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      className={className}
    >
      {title && <title>{title}</title>}
      <path d={PATHS[name]} />
    </svg>
  )
}
