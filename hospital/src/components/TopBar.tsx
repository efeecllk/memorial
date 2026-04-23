import { Search, Bell, Command, ExternalLink, Link2 } from 'lucide-react'
import { useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { todayMeta } from '../lib/data'
import { CHAIN, CONTRACTS, isDeployed, deployedCount, addressUrl } from '../lib/chain'

export function TopBar() {
  const [chainOpen, setChainOpen] = useState(false)
  const live = isDeployed()

  return (
    <header className="h-16 shrink-0 border-b border-ink/15 bg-bone/80 backdrop-blur-sm flex items-stretch relative">
      <div className="flex items-center px-7 border-r border-ink/15">
        <div className="leading-tight">
          <div className="font-mono text-[9.5px] smallcaps text-smoke">{todayMeta.shift}</div>
          <div className="font-display text-[14px]" style={{ fontWeight: 600 }}>
            {todayMeta.unit}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="flex-1 flex items-center px-6">
        <div className="flex items-center gap-3 w-full max-w-2xl">
          <Search size={15} className="text-smoke shrink-0" strokeWidth={1.5} />
          <input
            type="text"
            placeholder="Search patients · MRN · orders · notes"
            className="flex-1 bg-transparent outline-none font-display text-[14px] placeholder:text-smoke placeholder:italic"
            style={{ fontVariationSettings: '"opsz" 14' }}
          />
          <kbd className="font-mono text-[10px] text-smoke border border-rule rounded px-1.5 py-0.5 flex items-center gap-1">
            <Command size={9} strokeWidth={2} /> K
          </kbd>
        </div>
      </div>

      <div className="flex items-stretch border-l border-ink/15">
        {/* Chain status */}
        <button
          onClick={() => setChainOpen((v) => !v)}
          className="px-4 flex items-center gap-2 hover:bg-cream/40 transition-colors border-r border-ink/15"
          title={live ? `${CHAIN.name} · ${deployedCount()} contracts live` : 'chain not yet deployed'}
        >
          <div className="relative flex items-center justify-center w-2 h-2">
            {live ? (
              <>
                <motion.span
                  className="absolute inset-0 rounded-full bg-[#3B7338]"
                  animate={{ scale: [1, 2, 1], opacity: [0.6, 0, 0.6] }}
                  transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                />
                <span className="relative w-2 h-2 rounded-full bg-[#3B7338]" />
              </>
            ) : (
              <span className="relative w-2 h-2 rounded-full bg-rule" />
            )}
          </div>
          <div className="leading-tight text-left">
            <div className="font-mono text-[9px] uppercase tracking-[0.14em]" style={{ color: live ? '#3B7338' : 'var(--smoke)', fontWeight: 600 }}>
              {live ? 'on-chain' : 'off-chain'}
            </div>
            <div className="font-display text-[12px]" style={{ fontWeight: 500 }}>
              {CHAIN.name}
            </div>
          </div>
        </button>

        <button className="px-5 flex items-center gap-2.5 hover:bg-cream/40 transition-colors group">
          <div className="relative">
            <Bell size={16} strokeWidth={1.4} className="text-ink-soft group-hover:text-ink" />
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 bg-blood rounded-full" />
          </div>
          <span className="font-mono text-[10.5px] tnum text-ink-soft">06</span>
        </button>

        <div className="flex items-center px-6 border-l border-ink/15">
          <div className="text-right leading-tight">
            <div className="italic-serif text-[12px] text-ink-soft">today is</div>
            <div className="font-display text-[14px]" style={{ fontWeight: 600 }}>{todayMeta.date}</div>
          </div>
        </div>
      </div>

      {/* Chain detail popover */}
      <AnimatePresence>
        {chainOpen && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className="absolute right-[228px] top-full mt-2 bg-bone border border-ink/30 shadow-xl z-50 w-[380px] p-5"
          >
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="font-display text-[14px] uppercase tracking-wider" style={{ fontWeight: 700 }}>
                <Link2 size={12} strokeWidth={1.5} className="inline mb-0.5 mr-1" />
                Chain manifest
              </h3>
              <span className="font-mono text-[10px] text-smoke">{CHAIN.name} · {CHAIN.id}</span>
            </div>
            <div className="rule-double mb-3" />

            {!live ? (
              <p className="italic-serif text-[13px] text-ink-soft leading-relaxed">
                Contracts not yet deployed. Run <span className="font-mono text-[11px] text-ink">./contracts/script/deploy-and-wire.sh</span> after funding the deployer wallet.
              </p>
            ) : (
              <div className="space-y-1.5">
                {Object.entries(CONTRACTS).map(([name, addr]) => {
                  const short = addr.slice(0, 8) + '…' + addr.slice(-4)
                  return (
                    <a
                      key={name}
                      href={addressUrl(addr)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-baseline justify-between gap-2 py-1 px-2 hover:bg-cream/50 border-l-2 border-transparent hover:border-ocean transition-colors group"
                    >
                      <span className="font-display text-[12.5px] truncate" style={{ fontWeight: 600 }}>
                        {name}
                      </span>
                      <span className="font-mono text-[10.5px] text-ink-soft tnum flex items-center gap-1">
                        {short}
                        <ExternalLink size={9} strokeWidth={1.5} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                      </span>
                    </a>
                  )
                })}
                <div className="pt-3 mt-2 border-t border-rule-soft">
                  <a
                    href={CHAIN.explorer}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-[10px] uppercase tracking-wider text-ocean hover:text-ink underline underline-offset-4 decoration-ocean/40 flex items-center gap-1"
                  >
                    Monad explorer <ExternalLink size={10} strokeWidth={1.5} />
                  </a>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
