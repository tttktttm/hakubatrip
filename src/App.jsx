import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, Users, Wallet, Save, ArrowRight, Loader2, AlertCircle, Calendar, MapPin, Clock, CheckSquare, Train, RefreshCw } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, 
  serverTimestamp, setDoc, writeBatch 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// --- Firebase Configuration ---
const envConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : null;
const manualConfig = {
  apiKey: "AIzaSyDFgV-oI9ay5xlaozVGBpmuW1HBwwpJ7Xk",
  authDomain: "hakuba-plan.firebaseapp.com",
  projectId: "hakuba-plan",
  storageBucket: "hakuba-plan.firebasestorage.app",
  messagingSenderId: "383462260844",
  appId: "1:383462260844:web:6a42f90cc9f2501a891849",
  measurementId: "G-4FKW0LKLTV"
};
const firebaseConfig = envConfig || manualConfig;
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'hakuba-trip-2026';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TravelBudgetManager = () => {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [activeTab, setActiveTab] = useState('itinerary');
  const [loading, setLoading] = useState(true);

  // Data States
  const [members, setMembers] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [events, setEvents] = useState([]);
  const [accessList, setAccessList] = useState([]);
  const [packingList, setPackingList] = useState([]);

  // Input States
  const [newMemberName, setNewMemberName] = useState('');
  const [newEvent, setNewEvent] = useState({ time: '', title: '', note: '' }); // day is handled by section
  const [newAccess, setNewAccess] = useState({ area: '', text: '' });
  const [newPacking, setNewPacking] = useState('');

  // --- Auth ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (error) {
        console.error("Auth Error:", error);
        setAuthError(error.message);
        setLoading(false);
      }
    };
    initAuth();

    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser) setAuthError(null);
      else setTimeout(() => setLoading(false), 2000);
    });
    return () => unsubscribe();
  }, []);

  // --- Data Sync ---
  useEffect(() => {
    if (!user) return;

    const refs = {
      members: collection(db, 'artifacts', APP_ID, 'public', 'data', 'members'),
      expenses: collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'),
      events: collection(db, 'artifacts', APP_ID, 'public', 'data', 'events'),
      access: collection(db, 'artifacts', APP_ID, 'public', 'data', 'access'),
      packing: collection(db, 'artifacts', APP_ID, 'public', 'data', 'packing'),
    };

    const unsubscribes = [
      onSnapshot(refs.members, (snap) => setMembers(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)))),
      onSnapshot(refs.expenses, (snap) => setExpenses(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)))),
      onSnapshot(refs.events, (snap) => setEvents(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => a.time.localeCompare(b.time)))),
      onSnapshot(refs.access, (snap) => setAccessList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)))),
      onSnapshot(refs.packing, (snap) => {
        setPackingList(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (a.createdAt?.seconds||0)-(b.createdAt?.seconds||0)));
        setLoading(false);
      }),
    ];

    return () => unsubscribes.forEach(u => u());
  }, [user]);

  // --- Actions (Generic Helpers) ---
  const addData = async (collectionName, data) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', collectionName), {
        ...data,
        createdAt: serverTimestamp()
      });
    } catch (e) { alert("Error: " + e.message); }
  };

  const deleteData = async (collectionName, id) => {
    if (!user) return;
    try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', collectionName, id)); } catch (e) {}
  };

  const updateData = async (collectionName, id, field, value) => {
    if (!user) return;
    try { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', collectionName, id), { [field]: value }); } catch (e) {}
  };

  // --- Specific Add Handlers ---
  const handleAddMember = () => {
    if (newMemberName.trim() && !members.some(m => m.name === newMemberName)) {
      addData('members', { name: newMemberName });
      setNewMemberName('');
    }
  };

  const handleAddExpense = () => addData('expenses', { item: '新規項目', budget: 0, actual: 0, payer: '各自', splitType: 'split' });
  
  const handleAddEvent = (day) => {
    if (newEvent.time && newEvent.title) {
      addData('events', { day, ...newEvent });
      setNewEvent({ time: '', title: '', note: '' });
    }
  };

  const handleAddAccess = () => {
    if (newAccess.area && newAccess.text) {
      addData('access', newAccess);
      setNewAccess({ area: '', text: '' });
    }
  };

  const handleAddPacking = () => {
    if (newPacking.trim()) {
      addData('packing', { text: newPacking });
      setNewPacking('');
    }
  };

  // --- Load Sample Data ---
  const loadSampleData = async () => {
    if (!user) return;
    const batch = writeBatch(db);
    
    // Sample Events
    const samples = [
      { day: 'day1', time: '07:00', title: '各地出発', note: '交通手段ごとの集合場所を確認' },
      { day: 'day1', time: '11:00', title: '現地集合', note: '白馬駅 または 宿泊先' },
      { day: 'day1', time: '12:30', title: '滑走開始', note: 'リフト2日券利用' },
      { day: 'day1', time: '17:30', title: '宿チェックイン', note: '部屋割り確認・入浴' },
      { day: 'day1', time: '18:30', title: '夕食・懇親会', note: '美味しいお店で乾杯' },
      { day: 'day2', time: '08:00', title: '朝食・チェックアウト', note: '' },
      { day: 'day2', time: '09:00', title: '滑走開始', note: '午前中メインで' },
      { day: 'day2', time: '13:00', title: 'ランチ・終了準備', note: 'レンタル返却・着替え' },
      { day: 'day2', time: '15:00', title: '現地解散', note: 'お気をつけて！' },
    ];
    samples.forEach(d => {
      const ref = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'events'));
      batch.set(ref, { ...d, createdAt: serverTimestamp() });
    });

    // Sample Access
    const accessSamples = [
      { area: '東京', text: '新幹線+バス(約2.5h) / バス(約5h)' },
      { area: '大阪', text: 'サンダーバード+新幹線(約4.5h) / バス(約6h)' },
      { area: '名古屋', text: 'しなの(約3.5h)' },
      { area: '福岡', text: '飛行機(松本) / 東京経由' },
    ];
    accessSamples.forEach(d => {
      const ref = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'access'));
      batch.set(ref, { ...d, createdAt: serverTimestamp() });
    });

    // Sample Packing
    const packingSamples = ['現金・クレカ', '身分証・保険証', 'スマホ・充電器', 'ウェア上下', 'グローブ・ゴーグル・帽子', '厚手靴下・インナー', '日焼け止め・リップ'];
    packingSamples.forEach(text => {
      const ref = doc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'packing'));
      batch.set(ref, { text, createdAt: serverTimestamp() });
    });

    try { await batch.commit(); } catch(e) { alert("Error loading samples"); }
  };

  // --- Calculations ---
  const totalBudget = expenses.reduce((sum, e) => sum + Number(e.budget || 0), 0);
  const totalActual = expenses.reduce((sum, e) => sum + Number(e.actual || 0), 0);
  
  const calculateSettlements = () => {
    const memberNames = members.map(m => m.name);
    if (memberNames.length === 0) return { totalSharedCost: 0, perPersonShare: 0, transactions: [] };
    const balances = {};
    memberNames.forEach(m => balances[m] = 0);
    let totalSharedCost = 0;
    expenses.forEach(e => {
      const cost = Number(e.actual || 0);
      if (e.splitType === 'split') {
        totalSharedCost += cost;
        if (memberNames.includes(e.payer)) balances[e.payer] += cost;
      }
    });
    const perPersonShare = totalSharedCost / memberNames.length;
    memberNames.forEach(m => balances[m] -= perPersonShare);
    const debtors = [], creditors = [];
    Object.entries(balances).forEach(([name, amount]) => {
      const r = Math.round(amount);
      if (r < -1) debtors.push({ name, amount: r });
      if (r > 1) creditors.push({ name, amount: r });
    });
    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);
    const transactions = [];
    let i = 0, j = 0;
    while (i < debtors.length && j < creditors.length) {
      const d = debtors[i], c = creditors[j];
      const amt = Math.min(Math.abs(d.amount), c.amount);
      if (amt > 0) transactions.push({ from: d.name, to: c.name, amount: amt });
      d.amount += amt; c.amount -= amt;
      if (Math.abs(d.amount) < 1) i++;
      if (c.amount < 1) j++;
    }
    return { totalSharedCost, perPersonShare, transactions };
  };
  const { totalSharedCost, perPersonShare, transactions } = calculateSettlements();

  // --- Styles ---
  const styles = {
    container: { minHeight: '100vh', width: '100%', backgroundColor: '#f1f5f9', padding: '40px 20px', fontFamily: '"Helvetica Neue", Arial, sans-serif', color: '#333', boxSizing: 'border-box' },
    card: { maxWidth: '900px', margin: '0 auto', backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', overflow: 'hidden' },
    header: { backgroundColor: '#2563eb', color: '#fff', padding: '24px' },
    headerTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
    headerTitle: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginTop: '20px' },
    statBox: (isOver) => ({ backgroundColor: isOver ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255, 255, 255, 0.2)', padding: '12px', borderRadius: '8px', textAlign: 'center', color: '#fff' }),
    statLabel: { fontSize: '12px', textTransform: 'uppercase', opacity: 0.8, marginBottom: '4px' },
    statValue: { fontSize: '20px', fontWeight: 'bold' },
    tabs: { display: 'flex', borderBottom: '1px solid #eee' },
    tab: (active) => ({ flex: 1, padding: '16px', border: 'none', background: 'none', cursor: 'pointer', borderBottom: active ? '3px solid #2563eb' : '3px solid transparent', color: active ? '#2563eb' : '#64748b', fontWeight: 'bold', fontSize: '15px' }),
    content: { padding: '32px 24px' },
    section: { marginBottom: '32px', padding: '24px', backgroundColor: '#f8fafc', borderRadius: '12px', border: '1px solid #e2e8f0' },
    sectionTitle: { fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' },
    chipContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' },
    chip: { padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px', color: '#333' },
    deleteBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' },
    inputGroup: { display: 'flex', gap: '8px' },
    input: { padding: '10px 14px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1, fontSize: '15px', color: '#333', backgroundColor: '#fff' },
    btnPrimary: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold', fontSize: '14px' },
    btnSmall: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px', display:'flex', alignItems:'center', gap:'4px' },
    tableContainer: { overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', backgroundColor: '#fff' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '14px', borderBottom: '2px solid #e2e8f0', color: '#475569', backgroundColor: '#f8fafc', fontWeight: '600', whiteSpace: 'nowrap' },
    td: { padding: '8px 14px', borderBottom: '1px solid #e2e8f0', verticalAlign: 'middle' },
    inputTable: { width: '100%', padding: '8px', border: '1px solid transparent', borderRadius: '4px', background: 'transparent', color: '#333', fontSize: '14px', outline: 'none' },
    timeline: { position: 'relative', paddingLeft: '20px', borderLeft: '2px solid #e2e8f0', marginLeft: '10px' },
    timelineItem: { position: 'relative', marginBottom: '24px' },
    timelineDot: { position: 'absolute', left: '-27px', top: '0', width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#2563eb', border: '2px solid #fff', boxShadow: '0 0 0 2px #2563eb' },
    checkList: { listStyle: 'none', padding: 0, margin: 0 },
    checkItem: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9', color: '#333' },
    formRow: { display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' },
    errorBox: { backgroundColor: '#fee2e2', color: '#991b1b', padding: '16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }
  };

  if (loading && !authError) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center', backgroundColor: '#f1f5f9'}}><Loader2 className="animate-spin" /></div>;

  return (
    <div style={styles.container}>
      {authError && (
        <div style={styles.errorBox}>
          <AlertCircle />
          <div>
            <strong>認証エラー:</strong> Firebase Consoleで「匿名 (Anonymous)」ログインを有効にしてください。
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <Calculator />
            <h1 style={styles.headerTitle}>白馬旅行 2026</h1>
          </div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end'}}>
             <p style={{opacity: 0.8, fontSize: '14px', margin:0}}>全員で編集・共有できます</p>
          </div>
          <div style={styles.statsGrid}>
            <div style={styles.statBox(false)}><div style={styles.statLabel}>予算合計</div><div style={styles.statValue}>¥{totalBudget.toLocaleString()}</div></div>
            <div style={styles.statBox(totalActual > totalBudget)}><div style={styles.statLabel}>実績合計</div><div style={styles.statValue}>¥{totalActual.toLocaleString()}</div></div>
            <div style={styles.statBox(false)}><div style={styles.statLabel}>1人あたり (割勘)</div><div style={styles.statValue}>¥{Math.round(perPersonShare).toLocaleString()}</div></div>
          </div>
        </div>

        <div style={styles.tabs}>
          <button style={styles.tab(activeTab === 'itinerary')} onClick={() => setActiveTab('itinerary')}>🗓 旅程・詳細</button>
          <button style={styles.tab(activeTab === 'input')} onClick={() => setActiveTab('input')}>💰 予算入力</button>
          <button style={styles.tab(activeTab === 'report')} onClick={() => setActiveTab('report')}>📊 精算</button>
        </div>

        {activeTab === 'itinerary' && (
          <div style={styles.content}>
            {events.length === 0 && accessList.length === 0 && packingList.length === 0 && (
              <div style={{textAlign:'center', marginBottom:'20px'}}>
                <button onClick={loadSampleData} style={{...styles.btnPrimary, backgroundColor:'#059669', display:'inline-flex', alignItems:'center', gap:'8px'}}>
                  <RefreshCw size={16} /> 初期データを読み込む
                </button>
              </div>
            )}

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'24px'}}>
              {['day1', 'day2'].map(day => (
                <div key={day} style={styles.section}>
                  <h3 style={styles.sectionTitle}>
                    <Calendar size={20}/> {day === 'day1' ? '1/17 (土) 1日目' : '1/18 (日) 2日目'}
                  </h3>
                  <div style={styles.timeline}>
                    {events.filter(e => e.day === day).map((ev) => (
                      <div key={ev.id} style={styles.timelineItem}>
                        <div style={styles.timelineDot}></div>
                        <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-start'}}>
                          <div>
                            <div style={{fontSize: '14px', color: '#64748b', fontWeight: 'bold'}}>{ev.time}</div>
                            <div style={{fontSize: '16px', fontWeight: 'bold', color: '#333'}}>{ev.title}</div>
                            {ev.note && <div style={{fontSize: '13px', color: '#64748b'}}>{ev.note}</div>}
                          </div>
                          <button onClick={() => deleteData('events', ev.id)} style={styles.deleteBtn}><Trash2 size={14}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  {/* Add Event Form */}
                  <div style={{marginTop:'16px', borderTop:'1px dashed #cbd5e1', paddingTop:'12px'}}>
                    <div style={{fontSize:'12px', color:'#64748b', marginBottom:'4px'}}>予定を追加:</div>
                    <div style={styles.formRow}>
                      <input style={{...styles.input, width:'60px', flex:'none'}} placeholder="00:00" value={newEvent.time} onChange={e => setNewEvent({...newEvent, time: e.target.value})} />
                      <input style={styles.input} placeholder="タイトル" value={newEvent.title} onChange={e => setNewEvent({...newEvent, title: e.target.value})} />
                    </div>
                    <div style={styles.formRow}>
                       <input style={styles.input} placeholder="メモ (任意)" value={newEvent.note} onChange={e => setNewEvent({...newEvent, note: e.target.value})} />
                       <button onClick={() => handleAddEvent(day)} style={styles.btnSmall}><Plus size={14}/> 追加</button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'24px'}}>
              <div style={styles.section}>
                <h3 style={styles.sectionTitle}><Train size={20}/> アクセス目安</h3>
                <ul style={styles.checkList}>
                  {accessList.map((acc) => (
                    <li key={acc.id} style={styles.checkItem}>
                      <div>
                        <span style={{fontWeight:'bold', marginRight:'8px'}}>{acc.area}</span>
                        <span style={{fontSize:'14px', color:'#64748b'}}>{acc.text}</span>
                      </div>
                      <button onClick={() => deleteData('access', acc.id)} style={styles.deleteBtn}><Trash2 size={14}/></button>
                    </li>
                  ))}
                </ul>
                <div style={styles.formRow}>
                  <input style={{...styles.input, width:'60px', flex:'none'}} placeholder="地域" value={newAccess.area} onChange={e => setNewAccess({...newAccess, area: e.target.value})} />
                  <input style={styles.input} placeholder="詳細" value={newAccess.text} onChange={e => setNewAccess({...newAccess, text: e.target.value})} />
                  <button onClick={handleAddAccess} style={styles.btnSmall}>追加</button>
                </div>
              </div>

              <div style={styles.section}>
                <h3 style={styles.sectionTitle}><CheckSquare size={20}/> 持ち物リスト</h3>
                <ul style={styles.checkList}>
                  {packingList.map((item) => (
                    <li key={item.id} style={styles.checkItem}>
                      <div style={{display:'flex', alignItems:'center', gap:'10px'}}>
                        <div style={{width:'16px', height:'16px', border:'2px solid #cbd5e1', borderRadius:'4px'}}></div>
                        {item.text}
                      </div>
                      <button onClick={() => deleteData('packing', item.id)} style={styles.deleteBtn}><Trash2 size={14}/></button>
                    </li>
                  ))}
                </ul>
                <div style={styles.formRow}>
                  <input style={styles.input} placeholder="アイテム名" value={newPacking} onChange={e => setNewPacking(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAddPacking()} />
                  <button onClick={handleAddPacking} style={styles.btnSmall}>追加</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- Input Tab (Budget) --- */}
        {activeTab === 'input' && (
          <div style={styles.content}>
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}><Users size={20}/> 参加メンバー</h3>
              <div style={styles.chipContainer}>
                {members.length === 0 && <span style={{color:'#94a3b8'}}>メンバーを追加してください</span>}
                {members.map(m => (
                  <span key={m.id} style={styles.chip}>
                    {m.name} <button onClick={() => deleteData('members', m.id)} style={styles.deleteBtn}><Trash2 size={14}/></button>
                  </span>
                ))}
              </div>
              <div style={styles.inputGroup}>
                <input style={styles.input} value={newMemberName} onChange={(e) => setNewMemberName(e.target.value)} placeholder="名前を入力" onKeyDown={(e) => e.key === 'Enter' && handleAddMember()} />
                <button onClick={handleAddMember} style={styles.btnPrimary} disabled={!user}>追加</button>
              </div>
            </div>

            <div style={{...styles.section, backgroundColor: '#fff', border: 'none', padding: 0}}>
              <h3 style={styles.sectionTitle}><Wallet size={20}/> 支出リスト</h3>
              <div style={styles.tableContainer}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={{...styles.th, width: '30%'}}>項目名</th>
                      <th style={{...styles.th, width: '15%'}}>予算</th>
                      <th style={{...styles.th, width: '15%'}}>実績</th>
                      <th style={{...styles.th, width: '20%'}}>支払者</th>
                      <th style={{...styles.th, width: '15%'}}>区分</th>
                      <th style={styles.th}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((e) => (
                      <tr key={e.id}>
                        <td style={styles.td}><input style={{...styles.inputTable, borderBottom: '1px solid #ddd'}} value={e.item} onChange={ev => updateData('expenses', e.id, 'item', ev.target.value)} /></td>
                        <td style={styles.td}><input type="number" style={styles.inputTable} value={e.budget} onChange={ev => updateData('expenses', e.id, 'budget', Number(ev.target.value))} /></td>
                        <td style={styles.td}><input type="number" style={{...styles.inputTable, fontWeight:'bold', color: e.actual > e.budget ? '#ef4444' : '#333'}} value={e.actual} onChange={ev => updateData('expenses', e.id, 'actual', Number(ev.target.value))} /></td>
                        <td style={styles.td}>
                          <select style={styles.inputTable} value={e.payer} onChange={ev => updateData('expenses', e.id, 'payer', ev.target.value)}>
                            <option value="各自">各自</option>
                            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </td>
                        <td style={styles.td}>
                          <select style={styles.inputTable} value={e.splitType} onChange={ev => updateData('expenses', e.id, 'splitType', ev.target.value)}>
                            <option value="split">割勘</option>
                            <option value="individual">個人</option>
                          </select>
                        </td>
                        <td style={{...styles.td, textAlign:'center'}}>
                          <button onClick={() => deleteData('expenses', e.id)} style={{...styles.deleteBtn, color:'#ef4444'}}><Trash2 size={16}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={handleAddExpense} style={{...styles.btnPrimary, marginTop: '20px', display:'flex', alignItems:'center', gap:'8px'}}>
                <Plus size={16}/> 行を追加
              </button>
            </div>
          </div>
        )}

        {/* --- Report Tab --- */}
        {activeTab === 'report' && (
          <div style={styles.content}>
             <div style={{display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(300px, 1fr))', gap:'24px'}}>
              <div style={{backgroundColor:'#fff', padding:'24px', borderRadius:'12px', border:'1px solid #e2e8f0'}}>
                <h3 style={{...styles.sectionTitle, borderBottom:'1px solid #eee', paddingBottom:'10px'}}>内訳サマリー</h3>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                  <span style={{color:'#64748b'}}>割勘対象 総額</span><strong>¥{totalSharedCost.toLocaleString()}</strong>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                  <span style={{color:'#64748b'}}>人数</span><strong>{members.length} 名</strong>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:'15px', paddingTop:'15px', borderTop:'1px solid #eee', color:'#2563eb', fontSize:'18px'}}>
                  <strong>1人あたり</strong><strong>¥{Math.round(perPersonShare).toLocaleString()}</strong>
                </div>
              </div>
              <div style={{backgroundColor:'#fff', padding:'24px', borderRadius:'12px', border:'1px solid #bfdbfe', boxShadow:'0 0 0 1px #bfdbfe'}}>
                <h3 style={{...styles.sectionTitle, color:'#1e40af'}}>送金リスト</h3>
                {transactions.length === 0 ? <div style={{textAlign:'center', padding:'20px', color:'#94a3b8'}}>精算なし</div> : (
                  <div>{transactions.map((t, idx) => (
                      <div key={idx} style={{display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px', backgroundColor:'#eff6ff', borderRadius:'8px', marginBottom:'12px'}}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}><strong>{t.from}</strong><ArrowRight size={16} style={{color:'#94a3b8'}} /><strong>{t.to}</strong></div>
                        <strong style={{color:'#2563eb', fontSize:'18px'}}>¥{t.amount.toLocaleString()}</strong>
                      </div>
                  ))}</div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default TravelBudgetManager;