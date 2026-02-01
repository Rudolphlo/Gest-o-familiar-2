import React, { useState, useEffect } from 'react';
import { 
  Home, 
  CheckSquare, 
  GraduationCap, 
  Calendar as CalendarIcon, 
  Settings, 
  Plus, 
  Trash2, 
  Copy, 
  LogOut,
  Check,
  Clock,
  ShoppingBag,
  XCircle,
  ChevronLeft,
  Trash
} from 'lucide-react';

// Firebase Modules
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  onSnapshot, 
  serverTimestamp, 
  setDoc,
  getDoc,
  writeBatch,
  query
} from 'firebase/firestore';

// --- CONFIGURAÇÃO ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'familia-original-v1';

// --- COMPONENTES DE UI (IDENTIDADE VISUAL ORIGINAL) ---

const Button = ({ children, onClick, variant = 'primary', className = '', disabled = false }) => {
  const variants = {
    primary: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md",
    secondary: "bg-white text-indigo-600 border border-indigo-100 hover:bg-indigo-50",
    danger: "bg-red-50 text-red-600 hover:bg-red-100",
    ghost: "bg-transparent text-gray-400 hover:bg-gray-100"
  };
  return (
    <button 
      disabled={disabled}
      onClick={onClick} 
      className={`px-4 py-3 rounded-xl font-bold transition-all flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50 ${variants[variant]} ${className}`}
    >
      {children}
    </button>
  );
};

const Input = ({ label, ...props }) => (
  <div className="mb-4 text-left w-full">
    {label && <label className="block text-[10px] font-black text-gray-400 uppercase mb-1 ml-1 tracking-widest">{label}</label>}
    <input 
      {...props}
      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-50 outline-none transition-all bg-white text-gray-800"
    />
  </div>
);

// --- APP PRINCIPAL ---

export default function App() {
  const [user, setUser] = useState(null);
  const [familyData, setFamilyData] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [showSettings, setShowSettings] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  
  // States de Formulário
  const [isCreating, setIsCreating] = useState(false);
  const [familyName, setFamilyName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [newItem, setNewItem] = useState({ type: 'routine', title: '', details: '', date: '' });

  // 1. Auth & Persistência
  useEffect(() => {
    const initAuth = async () => {
      if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
        await signInWithCustomToken(auth, __initial_auth_token);
      } else {
        await signInAnonymously(auth);
      }
    };
    initAuth();
    return onAuthStateChanged(auth, setUser);
  }, []);

  // 2. Data Sync
  useEffect(() => {
    if (!user) return;

    const profileRef = doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'main');
    const unsubProfile = onSnapshot(profileRef, (snap) => {
      if (snap.exists() && snap.data().familyId) {
        const fId = snap.data().familyId;
        
        // Family Info
        onSnapshot(doc(db, 'artifacts', appId, 'public', 'data', 'families', fId), (fSnap) => {
          if (fSnap.exists()) setFamilyData({ id: fSnap.id, ...fSnap.data() });
        });

        // Items List
        const qItems = collection(db, 'artifacts', appId, 'public', 'data', 'family_items');
        onSnapshot(qItems, (snapshot) => {
          const all = snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .filter(i => i.familyId === fId);
          setItems(all.sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)));
          setLoading(false);
        }, (err) => console.error("Erro ao buscar itens:", err));
      } else {
        setLoading(false);
      }
    });

    return () => unsubProfile();
  }, [user]);

  // --- ACTIONS ---

  const handleCreateFamily = async () => {
    if (!familyName.trim()) return;
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'families', code), {
      name: familyName,
      members: [user.uid],
      createdAt: serverTimestamp()
    });
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'main'), { familyId: code });
  };

  const handleJoinFamily = async () => {
    const code = joinCode.trim().toUpperCase();
    const ref = doc(db, 'artifacts', appId, 'public', 'data', 'families', code);
    const snap = await getDoc(ref);
    if (snap.exists()) {
      await updateDoc(ref, { members: [...(snap.data().members || []), user.uid] });
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'main'), { familyId: code });
    } else {
      alert("Código não encontrado.");
    }
  };

  const handleAddItem = async () => {
    if (!newItem.title.trim()) return;
    await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'family_items'), {
      ...newItem,
      familyId: familyData.id,
      completed: false,
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });
    setShowAddModal(false);
    setNewItem({ ...newItem, title: '', details: '', date: '' });
  };

  const toggleItem = async (item) => {
    await updateDoc(doc(db, 'artifacts', appId, 'public', 'data', 'family_items', item.id), {
      completed: !item.completed
    });
  };

  const clearCompletedShopping = async () => {
    const completedShopping = items.filter(i => i.type === 'shopping' && i.completed);
    const batch = writeBatch(db);
    completedShopping.forEach(item => {
      batch.delete(doc(db, 'artifacts', appId, 'public', 'data', 'family_items', item.id));
    });
    await batch.commit();
  };

  const deleteItem = async (id) => {
    await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'family_items', id));
  };

  // --- RENDER HELPERS ---

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
    </div>
  );

  if (!familyData) return (
    <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 text-center">
      <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center mb-6">
        <Home className="w-10 h-10 text-indigo-600" />
      </div>
      <h1 className="text-2xl font-black text-gray-900 mb-2">Gestão Familiar</h1>
      <p className="text-gray-400 mb-10 text-sm">Organize sua casa em tempo real.</p>
      
      <div className="w-full max-w-xs space-y-4">
        {isCreating ? (
          <>
            <Input label="Nome da Família" placeholder="Ex: Família Silva" value={familyName} onChange={e => setFamilyName(e.target.value)} />
            <Button onClick={handleCreateFamily} className="w-full">Começar Agora</Button>
            <button onClick={() => setIsCreating(false)} className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Voltar</button>
          </>
        ) : (
          <>
            <Input label="Código de Convite" placeholder="Digite o código" value={joinCode} onChange={e => setJoinCode(e.target.value)} maxLength={6} />
            <Button onClick={handleJoinFamily} className="w-full">Entrar</Button>
            <div className="py-2 text-[10px] font-black text-gray-200 uppercase tracking-widest">Ou</div>
            <Button variant="secondary" onClick={() => setIsCreating(true)} className="w-full">Criar Nova Família</Button>
          </>
        )}
      </div>
    </div>
  );

  const getFilteredItems = () => {
    if (activeTab === 'dashboard') return items.slice(0, 5);
    const typeMap = { routine: 'routine', shopping: 'shopping', education: 'education', calendar: 'event' };
    return items.filter(i => i.type === typeMap[activeTab]);
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 flex flex-col max-w-md mx-auto relative shadow-2xl overflow-hidden font-sans">
      
      {/* HEADER ORIGINAL */}
      <header className="px-6 pt-12 pb-4 flex justify-between items-center bg-white sticky top-0 z-30 shadow-sm">
        <div>
          <h2 className="text-xl font-black text-gray-900">{familyData.name}</h2>
          <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-0.5">{familyData.members?.length || 1} Integrantes</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowSettings(true)} className="p-2.5 bg-gray-50 rounded-xl text-gray-400 active:bg-gray-100 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
          <button onClick={() => { 
            setNewItem({...newItem, type: activeTab === 'dashboard' ? 'routine' : (activeTab === 'calendar' ? 'event' : activeTab)}); 
            setShowAddModal(true); 
          }} className="p-2.5 bg-indigo-600 rounded-xl text-white shadow-lg active:scale-90 transition-transform">
            <Plus className="w-6 h-6" />
          </button>
        </div>
      </header>

      {/* CONTEÚDO */}
      <main className="flex-1 px-4 pt-6 pb-28 overflow-y-auto">
        
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-3">
              <div onClick={() => setActiveTab('shopping')} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm active:bg-gray-50 transition-colors">
                <div className="text-2xl font-black text-gray-900">{items.filter(i => i.type === 'shopping' && !i.completed).length}</div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Compras</div>
              </div>
              <div onClick={() => setActiveTab('routine')} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm active:bg-gray-50 transition-colors">
                <div className="text-2xl font-black text-gray-900">{items.filter(i => i.type === 'routine' && !i.completed).length}</div>
                <div className="text-[10px] font-black text-gray-400 uppercase tracking-widest mt-1">Rotinas</div>
              </div>
            </div>
            
            <div className="flex justify-between items-center px-1">
              <h3 className="text-[10px] font-black text-gray-300 uppercase tracking-widest">Atividades Recentes</h3>
              <Clock className="w-3 h-3 text-gray-300" />
            </div>

            <div className="space-y-3">
              {items.slice(0, 5).map(item => (
                <div key={item.id} className="bg-white p-4 rounded-xl border border-gray-100 flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${item.type === 'shopping' ? 'bg-orange-400' : 'bg-indigo-400'}`}></div>
                  <span className={`text-sm font-bold flex-1 ${item.completed ? 'text-gray-300 line-through' : 'text-gray-700'}`}>{item.title}</span>
                  {item.completed && <Check className="w-4 h-4 text-indigo-500" />}
                </div>
              ))}
              {items.length === 0 && <p className="text-center py-8 text-xs font-bold text-gray-300 uppercase tracking-widest">Nada por aqui</p>}
            </div>
          </div>
        )}

        {activeTab !== 'dashboard' && (
          <div className="space-y-4">
            <div className="flex justify-between items-end px-2 mb-2">
              <h2 className="text-xs font-black text-indigo-500 uppercase tracking-widest">{activeTab === 'calendar' ? 'Agenda' : activeTab === 'routine' ? 'Rotina' : activeTab === 'shopping' ? 'Compras' : 'Escola'}</h2>
              {activeTab === 'shopping' && items.some(i => i.type === 'shopping' && i.completed) && (
                <button onClick={clearCompletedShopping} className="text-[10px] font-black text-red-400 uppercase tracking-widest flex items-center gap-1">
                  <Trash className="w-3 h-3" /> Limpar Carrinho
                </button>
              )}
            </div>

            <div className="space-y-3">
              {getFilteredItems().length === 0 ? (
                <div className="py-20 text-center text-gray-300">
                  <p className="text-[10px] font-black uppercase tracking-widest">Lista Vazia</p>
                </div>
              ) : (
                getFilteredItems().map(item => (
                  <div key={item.id} className={`bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-center gap-4 transition-all ${item.completed ? 'opacity-40' : ''}`}>
                    <button 
                      onClick={() => toggleItem(item)} 
                      className={`w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${item.completed ? 'bg-indigo-600 border-indigo-600' : 'border-gray-100 active:border-indigo-200'}`}
                    >
                      {item.completed && <Check className="w-4 h-4 text-white" />}
                    </button>
                    <div className="flex-1" onClick={() => toggleItem(item)}>
                      <p className={`text-sm font-bold transition-all ${item.completed ? 'line-through text-gray-400' : 'text-gray-800'}`}>{item.title}</p>
                      {(item.date || item.details) && (
                        <div className="flex gap-2 mt-1">
                          {item.date && <span className="text-[9px] font-bold text-indigo-400 uppercase">{new Date(item.date).toLocaleDateString()}</span>}
                          {item.details && <span className="text-[9px] font-bold text-gray-400 uppercase truncate max-w-[150px]">{item.details}</span>}
                        </div>
                      )}
                    </div>
                    <button onClick={() => deleteItem(item.id)} className="text-gray-200 hover:text-red-400 active:scale-90 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </main>

      {/* NAVEGAÇÃO ORIGINAL */}
      <nav className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white border-t border-gray-50 px-4 pt-3 pb-8 flex justify-around items-center z-40">
        {[
          { id: 'dashboard', icon: Home, label: 'Início' },
          { id: 'routine', icon: CheckSquare, label: 'Rotina' },
          { id: 'shopping', icon: ShoppingBag, label: 'Compras' },
          { id: 'education', icon: GraduationCap, label: 'Escola' },
          { id: 'calendar', icon: CalendarIcon, label: 'Agenda' },
        ].map(tab => (
          <button 
            key={tab.id} 
            onClick={() => setActiveTab(tab.id)} 
            className={`flex flex-col items-center gap-1.5 p-2 transition-colors ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-300'}`}
          >
            <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? 'stroke-[2.5px]' : 'stroke-[2px]'}`} />
            <span className="text-[9px] font-bold uppercase tracking-tighter">{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* MODAL ADICIONAR */}
      {showAddModal && (
        <div className="absolute inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-end p-4">
          <div className="bg-white w-full rounded-3xl p-6 pb-10 shadow-2xl animate-in slide-in-from-bottom-10 duration-300">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-black text-gray-900">Novo Registro</h3>
              <button onClick={() => setShowAddModal(false)} className="text-gray-300"><XCircle /></button>
            </div>
            
            <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide no-scrollbar">
              {[
                {id: 'routine', label: 'Rotina'},
                {id: 'shopping', label: 'Compra'},
                {id: 'education', label: 'Escola'},
                {id: 'event', label: 'Evento'}
              ].map(t => (
                <button 
                  key={t.id} 
                  onClick={() => setNewItem({...newItem, type: t.id})} 
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest flex-shrink-0 transition-all ${newItem.type === t.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-gray-50 text-gray-400'}`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            <Input label="O que deseja adicionar?" value={newItem.title} onChange={e => setNewItem({...newItem, title: e.target.value})} autoFocus placeholder="Título do item..." />
            <Input label="Detalhes (Opcional)" value={newItem.details} onChange={e => setNewItem({...newItem, details: e.target.value})} placeholder="Mais informações..." />
            
            {(newItem.type === 'event' || newItem.type === 'education') && (
              <Input type="date" label="Data Planejada" value={newItem.date} onChange={e => setNewItem({...newItem, date: e.target.value})} />
            )}

            <div className="flex gap-3 mt-4">
              <Button variant="ghost" onClick={() => setShowAddModal(false)} className="flex-1">Cancelar</Button>
              <Button onClick={handleAddItem} className="flex-1" disabled={!newItem.title.trim()}>Salvar</Button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIGURAÇÕES */}
      {showSettings && (
        <div className="absolute inset-0 z-[110] bg-white p-6 animate-in slide-in-from-right duration-300">
          <div className="flex items-center gap-4 mb-8">
            <button onClick={() => setShowSettings(false)} className="p-2 bg-gray-50 rounded-xl text-gray-400 active:scale-90 transition-all">
              <ChevronLeft className="w-6 h-6" />
            </button>
            <h2 className="text-xl font-black text-gray-900">Ajustes da Família</h2>
          </div>
          
          <div className="bg-indigo-50 p-6 rounded-3xl border border-indigo-100 mb-8 text-center">
            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-2">Código para Compartilhar</p>
            <div className="flex items-center justify-between bg-white/50 p-4 rounded-2xl">
              <span className="text-2xl font-black text-indigo-700 tracking-[0.2em]">{familyData.id}</span>
              <button 
                onClick={() => { navigator.clipboard.writeText(familyData.id); alert("Código copiado para o teclado!"); }} 
                className="p-3 bg-white rounded-xl shadow-sm text-indigo-600 active:bg-indigo-600 active:text-white transition-all"
              >
                <Copy className="w-5 h-5" />
              </button>
            </div>
            <p className="text-[9px] font-bold text-indigo-300 mt-4 uppercase italic">Envie este código para os outros moradores</p>
          </div>

          <div className="space-y-3">
             <Button variant="danger" onClick={async () => { 
               if(confirm("Tem certeza que deseja sair deste grupo familiar?")) {
                 await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'main'), { familyId: null }); 
                 window.location.reload(); 
               }
             }} className="w-full">
                <LogOut className="w-5 h-5" /> Sair da Família
              </Button>
              <p className="text-[9px] text-center text-gray-300 font-bold uppercase mt-10">Versão Sincronizada 1.0.4</p>
          </div>
        </div>
      )}

    </div>
  );
}


