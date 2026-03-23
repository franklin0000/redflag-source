import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion'; // eslint-disable-line no-unused-vars
import { useAccount, useConnect, useDisconnect, useWriteContract, useWaitForTransactionReceipt } from 'wagmi';
import {
  getRFLAGBalance,
  getCheckinStatus,
  getRFLAGHistory,
  TOKEN_INFO,
  REWARDS,
  SPEND_COSTS,
  RFLAG_ADDRESS,
  RFLAG_ABI,
} from '../services/rflagToken';

const IS_DEPLOYED = RFLAG_ADDRESS !== '0x0000000000000000000000000000000000000000';

export default function TokenWallet() {
  const navigate = useNavigate();
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  const { writeContract, data: txHash, isPending: txPending, error: txError } = useWriteContract();
  const { isLoading: txConfirming, isSuccess: txSuccess } = useWaitForTransactionReceipt({ hash: txHash });

  const [balance, setBalance]       = useState('0');
  const [history, setHistory]       = useState([]);
  const [checkin, setCheckin]       = useState({ canClaim: true, nextCheckin: null });
  const [loading, setLoading]       = useState(true);
  const [activeTab, setActiveTab]   = useState('wallet'); // wallet | earn | spend
  const [claimingCheckin, setClaimingCheckin] = useState(false);
  const [spendingItem, setSpendingItem] = useState(null); // label of item being spent

  const loadData = useCallback(async () => {
    if (!address) { setLoading(false); return; }
    setLoading(true);
    const [bal, hist, ci] = await Promise.all([
      getRFLAGBalance(address),
      getRFLAGHistory(address),
      getCheckinStatus(address),
    ]);
    setBalance(Number(bal).toLocaleString('en', { maximumFractionDigits: 2 }));
    setHistory(hist);
    setCheckin(ci);
    setLoading(false);
  }, [address]);

  useEffect(() => { loadData(); }, [loadData]);

  // Reload balance after successful transaction
  useEffect(() => {
    if (txSuccess) {
      loadData();
      setSpendingItem(null);
    }
  }, [txSuccess, loadData]);

  const handleCheckin = () => {
    if (!isConnected || !checkin.canClaim) return;
    if (IS_DEPLOYED) {
      writeContract({
        address: RFLAG_ADDRESS,
        abi: RFLAG_ABI,
        functionName: 'claimDailyCheckin',
      });
    } else {
      // Pre-launch preview: simulate check-in
      setClaimingCheckin(true);
      setTimeout(() => {
        setCheckin({ canClaim: false, nextCheckin: new Date(Date.now() + 86400000) });
        setBalance(prev => (parseFloat(prev.replace(/,/g,'')) + REWARDS.DAILY_CHECKIN).toLocaleString('en', { maximumFractionDigits: 2 }));
        setClaimingCheckin(false);
      }, 1500);
    }
  };

  const handleSpend = (functionName, label) => {
    if (!isConnected || !IS_DEPLOYED) return;
    setSpendingItem(label);
    writeContract({
      address: RFLAG_ADDRESS,
      abi: RFLAG_ABI,
      functionName,
    });
  };

  const formatAddress = (addr) => addr ? `${addr.slice(0,6)}...${addr.slice(-4)}` : '';
  const formatAmount = (n) => parseFloat(n).toLocaleString('en', { maximumFractionDigits: 2 });

  return (
    <div className="min-h-screen bg-[#22101f] text-white pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-[#22101f]/95 backdrop-blur border-b border-white/10 px-4 py-3 flex items-center gap-3">
        <button onClick={() => navigate(-1)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1">
          <h1 className="font-bold text-lg leading-none">$RFLAG Wallet</h1>
          <p className="text-xs text-white/50 mt-0.5">RedFlag Token · Polygon</p>
        </div>
        {isConnected && (
          <button
            onClick={() => disconnect()}
            className="text-xs text-white/40 hover:text-white/70 transition-colors px-3 py-1 rounded-full border border-white/10"
          >
            {formatAddress(address)}
          </button>
        )}
      </div>

      <div className="max-w-md mx-auto px-4 pt-6 space-y-5">

        {/* Not deployed banner */}
        {!IS_DEPLOYED && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="bg-yellow-500/10 border border-yellow-500/30 rounded-2xl p-4 flex gap-3"
          >
            <span className="text-yellow-400 text-xl">⚠️</span>
            <div>
              <p className="text-yellow-300 font-semibold text-sm">Contrato en preparación</p>
              <p className="text-yellow-300/70 text-xs mt-1">
                $RFLAG se lanzará pronto en Polygon. Los balances mostrados son una previsualización.
              </p>
            </div>
          </motion.div>
        )}

        {/* Connect Wallet */}
        {!isConnected ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-gradient-to-br from-[#d411b4]/20 to-purple-900/20 border border-[#d411b4]/30 rounded-3xl p-8 text-center"
          >
            <div className="text-6xl mb-4">🪙</div>
            <h2 className="text-xl font-bold mb-2">Conecta tu wallet</h2>
            <p className="text-white/60 text-sm mb-6">
              Conecta MetaMask o cualquier wallet compatible con Polygon para ver tu balance de $RFLAG
            </p>
            <div className="space-y-3">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  onClick={() => connect({ connector })}
                  className="w-full bg-[#d411b4] hover:bg-[#b30e99] text-white font-semibold py-3 px-6 rounded-2xl transition-colors"
                >
                  Conectar con {connector.name}
                </button>
              ))}
            </div>
          </motion.div>
        ) : (
          <>
            {/* Balance Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
              className="bg-gradient-to-br from-[#d411b4] to-purple-800 rounded-3xl p-6 relative overflow-hidden"
            >
              <div className="absolute inset-0 opacity-10">
                <div className="absolute top-0 right-0 w-40 h-40 bg-white rounded-full -translate-y-1/2 translate-x-1/2" />
                <div className="absolute bottom-0 left-0 w-24 h-24 bg-white rounded-full translate-y-1/2 -translate-x-1/2" />
              </div>
              <div className="relative">
                <p className="text-white/70 text-sm font-medium">Tu Balance</p>
                {loading ? (
                  <div className="h-12 w-40 bg-white/20 rounded-xl mt-2 animate-pulse" />
                ) : (
                  <div className="flex items-end gap-2 mt-1">
                    <span className="text-4xl font-black">{balance}</span>
                    <span className="text-xl font-bold text-white/80 mb-1">RFLAG</span>
                  </div>
                )}
                <div className="flex items-center gap-2 mt-3">
                  <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
                  <span className="text-xs text-white/70">
                    {TOKEN_INFO.network} · {formatAddress(address)}
                  </span>
                </div>
              </div>
            </motion.div>

            {/* Daily Check-in */}
            <motion.button
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              onClick={handleCheckin}
              disabled={!checkin.canClaim || claimingCheckin || (IS_DEPLOYED && (txPending || txConfirming) && !spendingItem)}
              className={`w-full rounded-2xl p-4 flex items-center gap-4 transition-all ${
                checkin.canClaim
                  ? 'bg-green-500/20 border border-green-500/40 hover:bg-green-500/30'
                  : 'bg-white/5 border border-white/10 opacity-60 cursor-not-allowed'
              }`}
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl ${
                checkin.canClaim ? 'bg-green-500/30' : 'bg-white/10'
              }`}>
                {claimingCheckin ? '⏳' : checkin.canClaim ? '🎁' : '✅'}
              </div>
              <div className="flex-1 text-left">
                <p className="font-semibold text-sm">Check-in Diario</p>
                <p className="text-xs text-white/60 mt-0.5">
                  {claimingCheckin
                    ? 'Reclamando...'
                    : checkin.canClaim
                    ? `Reclama +${REWARDS.DAILY_CHECKIN} RFLAG gratis`
                    : `Próximo: ${checkin.nextCheckin?.toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' }) || 'mañana'}`
                  }
                </p>
              </div>
              {checkin.canClaim && !claimingCheckin && (
                <span className="text-green-400 font-bold text-sm">+{REWARDS.DAILY_CHECKIN}</span>
              )}
            </motion.button>

            {/* Tabs */}
            <div className="flex bg-white/5 rounded-2xl p-1">
              {[
                { id: 'wallet', label: 'Historial' },
                { id: 'earn',   label: 'Ganar' },
                { id: 'spend',  label: 'Gastar' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#d411b4] text-white'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <AnimatePresence mode="wait">
              {/* History Tab */}
              {activeTab === 'wallet' && (
                <motion.div
                  key="wallet"
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  className="space-y-3"
                >
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="h-16 bg-white/5 rounded-2xl animate-pulse" />
                    ))
                  ) : history.length === 0 ? (
                    <div className="text-center py-12 text-white/40">
                      <p className="text-4xl mb-3">📭</p>
                      <p>No hay transacciones aún</p>
                    </div>
                  ) : (
                    history.map((tx, i) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4"
                      >
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${
                          tx.type === 'received' ? 'bg-green-500/20' : 'bg-red-500/20'
                        }`}>
                          {tx.type === 'received' ? '↓' : '↑'}
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-medium">{tx.reason || (tx.type === 'received' ? 'Recibido' : 'Enviado')}</p>
                          <p className="text-xs text-white/40 mt-0.5">{tx.date || 'Reciente'}</p>
                        </div>
                        <span className={`font-bold text-sm ${
                          tx.type === 'received' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {tx.type === 'received' ? '+' : '-'}{formatAmount(tx.amount)} RFLAG
                        </span>
                      </motion.div>
                    ))
                  )}
                </motion.div>
              )}

              {/* Earn Tab */}
              {activeTab === 'earn' && (
                <motion.div
                  key="earn"
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  className="space-y-3"
                >
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider px-1">Cómo ganar $RFLAG</p>
                  {[
                    { icon: '✅', label: 'Verificar tu perfil',        reward: REWARDS.VERIFY_PROFILE,  action: () => navigate('/profile') },
                    { icon: '🚩', label: 'Reportar perfil falso',       reward: REWARDS.CONFIRM_REPORT, action: () => navigate('/reports') },
                    { icon: '💘', label: 'Match activo 7 días',         reward: REWARDS.MATCH_7DAYS,    action: () => navigate('/dating') },
                    { icon: '🛡️', label: 'Usar SafeRide',               reward: REWARDS.USE_SAFERIDE,   action: () => navigate('/safe-ride') },
                    { icon: '🎁', label: 'Check-in diario',             reward: REWARDS.DAILY_CHECKIN,  action: handleCheckin, disabled: !checkin.canClaim },
                  ].map((item, i) => (
                    <motion.button
                      key={i}
                      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                      onClick={item.action}
                      disabled={item.disabled}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-4 flex items-center gap-4 hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <div className="w-10 h-10 bg-green-500/20 rounded-xl flex items-center justify-center text-xl">
                        {item.icon}
                      </div>
                      <div className="flex-1 text-left">
                        <p className="text-sm font-medium">{item.label}</p>
                      </div>
                      <span className="text-green-400 font-bold text-sm">+{item.reward} RFLAG</span>
                    </motion.button>
                  ))}
                </motion.div>
              )}

              {/* Spend Tab */}
              {activeTab === 'spend' && (
                <motion.div
                  key="spend"
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}
                  className="space-y-3"
                >
                  <p className="text-white/50 text-xs font-medium uppercase tracking-wider px-1">Usa $RFLAG en el app</p>
                  {txError && (
                    <p className="text-red-400 text-xs px-1">{txError.shortMessage || 'Error en transacción'}</p>
                  )}
                  {[
                    {
                      icon: '👑', label: 'Premium 1 mes',
                      desc: 'Búsqueda ilimitada, FaceScan, Dating',
                      cost: SPEND_COSTS.PREMIUM_MONTH,
                      fn: 'spendPremium',
                    },
                    {
                      icon: '🚀', label: 'Boost de perfil',
                      desc: 'Aparece primero en búsquedas por 24h',
                      cost: SPEND_COSTS.BOOST_PROFILE,
                      fn: 'spendBoost',
                    },
                    {
                      icon: '🎯', label: 'Soporte prioritario',
                      desc: 'Respuesta en menos de 1 hora',
                      cost: SPEND_COSTS.PRIORITY_SUPPORT,
                      fn: 'spendPrioritySupport',
                    },
                  ].map((item, i) => {
                    const bal = parseFloat(balance.replace(/,/g,''));
                    const canAfford = bal >= item.cost;
                    const isBusy = (txPending || txConfirming) && spendingItem === item.label;
                    return (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
                        className="bg-white/5 border border-white/10 rounded-2xl p-4"
                      >
                        <div className="flex items-start gap-4">
                          <div className="w-10 h-10 bg-[#d411b4]/20 rounded-xl flex items-center justify-center text-xl flex-shrink-0">
                            {item.icon}
                          </div>
                          <div className="flex-1">
                            <p className="font-semibold text-sm">{item.label}</p>
                            <p className="text-xs text-white/50 mt-0.5">{item.desc}</p>
                          </div>
                        </div>
                        <button
                          disabled={!canAfford || !IS_DEPLOYED || isBusy}
                          onClick={() => handleSpend(item.fn, item.label)}
                          className={`w-full mt-3 py-2.5 rounded-xl text-sm font-bold transition-all ${
                            canAfford && IS_DEPLOYED && !isBusy
                              ? 'bg-[#d411b4] hover:bg-[#b30e99] text-white'
                              : 'bg-white/10 text-white/30 cursor-not-allowed'
                          }`}
                        >
                          {isBusy
                            ? (txConfirming ? 'Confirmando...' : 'Procesando...')
                            : !IS_DEPLOYED
                            ? 'Disponible pronto'
                            : canAfford
                            ? `Quemar ${item.cost} RFLAG`
                            : `Necesitas ${item.cost - bal} RFLAG más`}
                        </button>
                      </motion.div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Token Info */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2"
            >
              <p className="text-white/40 text-xs font-medium uppercase tracking-wider">Info del Token</p>
              {[
                { label: 'Nombre',       value: 'RedFlag Token ($RFLAG)' },
                { label: 'Red',          value: TOKEN_INFO.network },
                { label: 'Supply total', value: `${TOKEN_INFO.maxSupply} RFLAG` },
                { label: 'Contrato',     value: IS_DEPLOYED ? `${RFLAG_ADDRESS.slice(0,10)}...` : 'Próximamente' },
              ].map(({ label, value }) => (
                <div key={label} className="flex justify-between text-xs">
                  <span className="text-white/50">{label}</span>
                  <span className="text-white/80 font-medium">{value}</span>
                </div>
              ))}
              {IS_DEPLOYED && (
                <a
                  href={TOKEN_INFO.polygonscanUrl(RFLAG_ADDRESS)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block text-center text-xs text-[#d411b4] hover:text-[#e855cc] mt-2 transition-colors"
                >
                  Ver en Polygonscan →
                </a>
              )}
            </motion.div>

            {/* Security / Anti-Rug Section */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}
              className="bg-green-500/5 border border-green-500/20 rounded-2xl p-4 space-y-3"
            >
              <p className="text-green-400 text-xs font-bold uppercase tracking-wider">🔒 Seguridad Anti-Rug</p>

              {/* Ownership renounced */}
              <a
                href="https://polygonscan.com/tx/0x270309e42241b37d94285dc0c21df6c4df918281c8d3efae2c704a71259f65cb"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 transition-colors"
              >
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-sm flex-shrink-0">✅</div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">Ownership Renunciado</p>
                  <p className="text-xs text-white/40">No se pueden crear más tokens jamás</p>
                </div>
                <span className="text-green-400 text-xs">Ver →</span>
              </a>

              {/* LP Locked */}
              <a
                href="https://polygonscan.com/address/0x3D357741F340C745B0FFe6C4DC25FC42c0CeA1A5"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 transition-colors"
              >
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-sm flex-shrink-0">🔐</div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">Liquidez Bloqueada 2 Años</p>
                  <p className="text-xs text-white/40">8.1M SLP bloqueados hasta 2028-03-23</p>
                </div>
                <span className="text-green-400 text-xs">Ver →</span>
              </a>

              {/* Source verified */}
              <a
                href="https://repo.sourcify.dev/contracts/full_match/137/0x3D357741F340C745B0FFe6C4DC25FC42c0CeA1A5/"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 hover:bg-white/5 rounded-xl p-1 transition-colors"
              >
                <div className="w-8 h-8 bg-green-500/20 rounded-lg flex items-center justify-center text-sm flex-shrink-0">📋</div>
                <div className="flex-1">
                  <p className="text-xs font-semibold text-white">Código Verificado Públicamente</p>
                  <p className="text-xs text-white/40">TimeLock sin backdoors — auditable</p>
                </div>
                <span className="text-green-400 text-xs">Ver →</span>
              </a>
            </motion.div>

            {/* Buy / Trade Links */}
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}
              className="bg-white/3 border border-white/8 rounded-2xl p-4 space-y-2"
            >
              <p className="text-white/40 text-xs font-medium uppercase tracking-wider">Comprar / Tradear</p>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <a
                  href={`https://app.sushi.com/swap?inputCurrency=MATIC&outputCurrency=${RFLAG_ADDRESS}&chainId=137`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-[#d411b4]/20 hover:bg-[#d411b4]/30 border border-[#d411b4]/30 rounded-xl py-3 text-xs font-bold text-[#e060d8] transition-colors"
                >
                  🍣 Comprar en SushiSwap
                </a>
                <a
                  href="https://dexscreener.com/polygon/0x594808de92386dd407a12c4c021b40e8d24e5e54"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 text-xs font-bold text-white/70 transition-colors"
                >
                  📈 Ver Chart
                </a>
                <a
                  href="/whitepaper.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 text-xs font-bold text-white/70 transition-colors"
                >
                  📄 White Paper
                </a>
                <a
                  href={`https://polygonscan.com/token/${RFLAG_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl py-3 text-xs font-bold text-white/70 transition-colors"
                >
                  🔍 Polygonscan
                </a>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
