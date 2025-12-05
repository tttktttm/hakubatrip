import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Calculator, Users, Wallet, Save, ArrowRight, Loader2, AlertCircle } from 'lucide-react';

// --- Firebase Imports ---
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, collection, doc, addDoc, updateDoc, deleteDoc, onSnapshot, 
  serverTimestamp, setDoc 
} from 'firebase/firestore';
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from 'firebase/auth';

// --- Firebase Configuration ---

// 環境変数 or 手動設定
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

// アプリID
const APP_ID = typeof __app_id !== 'undefined' ? __app_id : 'hakuba-trip-2026';

// Initialize
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const TravelBudgetManager = () => {
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [members, setMembers] = useState([]); 
  const [newMemberName, setNewMemberName] = useState('');
  const [expenses, setExpenses] = useState([]);
  const [activeTab, setActiveTab] = useState('input');
  const [loading, setLoading] = useState(true);

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
      if (currentUser) {
        setAuthError(null);
      } else {
        // ユーザーがnullでもローディング解除（エラー表示用）
        setTimeout(() => setLoading(false), 2000); 
      }
    });
    return () => unsubscribe();
  }, []);

  // --- Data Sync ---
  useEffect(() => {
    if (!user) return;

    const membersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'members');
    const expensesRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses');

    const unsubMembers = onSnapshot(membersRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setMembers(data);
    }, (e) => console.error(e));

    const unsubExpenses = onSnapshot(expensesRef, (snapshot) => {
      const data = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      data.sort((a, b) => (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0));
      setExpenses(data);
      setLoading(false);
    }, (e) => console.error(e));

    return () => {
      unsubMembers();
      unsubExpenses();
    };
  }, [user]);

  // --- Actions ---
  const addMember = async () => {
    if (!newMemberName.trim() || !user) return;
    if (members.some(m => m.name === newMemberName)) return;
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'members'), {
        name: newMemberName,
        createdAt: serverTimestamp()
      });
      setNewMemberName('');
    } catch (e) { alert("書き込みエラー: " + e.message); }
  };

  const removeMember = async (id) => {
    if(!user) return;
    try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'members', id)); } catch(e){}
  };

  const addExpense = async () => {
    if(!user) return;
    try {
      await addDoc(collection(db, 'artifacts', APP_ID, 'public', 'data', 'expenses'), {
        item: '新規項目', budget: 0, actual: 0, payer: '各自', splitType: 'split',
        createdAt: serverTimestamp()
      });
    } catch(e) { alert("書き込みエラー: " + e.message); }
  };

  const updateExpense = async (id, field, value) => {
    if(!user) return;
    try { await updateDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id), { [field]: value }); } catch(e){}
  };

  const removeExpense = async (id) => {
    if(!user) return;
    try { await deleteDoc(doc(db, 'artifacts', APP_ID, 'public', 'data', 'expenses', id)); } catch(e){}
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

    const debtors = [];
    const creditors = [];
    Object.entries(balances).forEach(([name, amount]) => {
      const rounded = Math.round(amount);
      if (rounded < -1) debtors.push({ name, amount: rounded });
      if (rounded > 1) creditors.push({ name, amount: rounded });
    });

    debtors.sort((a, b) => a.amount - b.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const transactions = [];
    let i = 0; let j = 0;
    while (i < debtors.length && j < creditors.length) {
      const debtor = debtors[i];
      const creditor = creditors[j];
      const amountToPay = Math.min(Math.abs(debtor.amount), creditor.amount);
      if (amountToPay > 0) transactions.push({ from: debtor.name, to: creditor.name, amount: amountToPay });
      debtor.amount += amountToPay;
      creditor.amount -= amountToPay;
      if (Math.abs(debtor.amount) < 1) i++;
      if (creditor.amount < 1) j++;
    }
    return { totalSharedCost, perPersonShare, transactions };
  };

  const { totalSharedCost, perPersonShare, transactions } = calculateSettlements();

  // --- Inline CSS Styles (No Tailwind required) ---
  const styles = {
    container: { maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: '"Helvetica Neue", Arial, sans-serif', color: '#333' },
    card: { backgroundColor: '#fff', borderRadius: '12px', boxShadow: '0 4px 15px rgba(0,0,0,0.1)', overflow: 'hidden' },
    header: { backgroundColor: '#2563eb', color: '#fff', padding: '24px' },
    headerTop: { display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' },
    headerTitle: { fontSize: '24px', fontWeight: 'bold', margin: 0 },
    statsGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '16px', marginTop: '20px' },
    statBox: (isOverBudget) => ({
      backgroundColor: isOverBudget ? 'rgba(239, 68, 68, 0.9)' : 'rgba(255, 255, 255, 0.2)',
      padding: '12px', borderRadius: '8px', textAlign: 'center', color: '#fff'
    }),
    statLabel: { fontSize: '12px', textTransform: 'uppercase', opacity: 0.8, marginBottom: '4px' },
    statValue: { fontSize: '20px', fontWeight: 'bold' },
    
    tabs: { display: 'flex', borderBottom: '1px solid #eee' },
    tab: (isActive) => ({
      flex: 1, padding: '16px', border: 'none', background: 'none', cursor: 'pointer',
      borderBottom: isActive ? '3px solid #2563eb' : '3px solid transparent',
      color: isActive ? '#2563eb' : '#666', fontWeight: 'bold'
    }),
    
    content: { padding: '24px' },
    section: { marginBottom: '32px', padding: '20px', backgroundColor: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' },
    sectionTitle: { fontSize: '18px', fontWeight: 'bold', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px', color: '#1e293b' },
    
    chipContainer: { display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' },
    chip: { padding: '6px 12px', backgroundColor: '#fff', border: '1px solid #cbd5e1', borderRadius: '20px', fontSize: '14px', display: 'flex', alignItems: 'center', gap: '6px' },
    deleteBtn: { background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 },
    
    inputGroup: { display: 'flex', gap: '8px' },
    input: { padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: '6px', flex: 1 },
    btnPrimary: { backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer' },
    
    tableContainer: { overflowX: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' },
    th: { textAlign: 'left', padding: '12px', borderBottom: '2px solid #e2e8f0', color: '#64748b' },
    td: { padding: '12px', borderBottom: '1px solid #e2e8f0' },
    inputTable: { width: '100%', padding: '6px', border: '1px solid transparent', borderRadius: '4px', background: 'transparent' },
    
    reportGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' },
    reportCard: { backgroundColor: '#fff', padding: '20px', borderRadius: '8px', border: '1px solid #e2e8f0' },
    transaction: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', backgroundColor: '#eff6ff', borderRadius: '6px', marginBottom: '8px' },
    arrow: { color: '#94a3b8' },
    
    errorBox: { backgroundColor: '#fee2e2', color: '#991b1b', padding: '16px', borderRadius: '8px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }
  };

  if (loading && !authError) return <div style={{height:'100vh', display:'flex', justifyContent:'center', alignItems:'center'}}><Loader2 className="animate-spin" /></div>;

  return (
    <div style={styles.container}>
      {authError && (
        <div style={styles.errorBox}>
          <AlertCircle />
          <div>
            <strong>認証エラー:</strong> データの読み書きができません。<br/>
            Firebase Consoleで「Authentication (認証)」→「Sign-in method」→「匿名 (Anonymous)」を有効にしてください。
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={styles.header}>
          <div style={styles.headerTop}>
            <Calculator />
            <h1 style={styles.headerTitle}>白馬旅行 予算＆精算</h1>
          </div>
          <p style={{opacity: 0.8, fontSize: '14px'}}>全員で編集・共有できます</p>

          <div style={styles.statsGrid}>
            <div style={styles.statBox(false)}>
              <div style={styles.statLabel}>予算合計</div>
              <div style={styles.statValue}>¥{totalBudget.toLocaleString()}</div>
            </div>
            <div style={styles.statBox(totalActual > totalBudget)}>
              <div style={styles.statLabel}>実績合計</div>
              <div style={styles.statValue}>¥{totalActual.toLocaleString()}</div>
            </div>
            <div style={styles.statBox(false)}>
              <div style={styles.statLabel}>1人あたり (割勘)</div>
              <div style={styles.statValue}>¥{Math.round(perPersonShare).toLocaleString()}</div>
            </div>
          </div>
        </div>

        <div style={styles.tabs}>
          <button style={styles.tab(activeTab === 'input')} onClick={() => setActiveTab('input')}>1. 入力・編集</button>
          <button style={styles.tab(activeTab === 'report')} onClick={() => setActiveTab('report')}>2. 精算レポート</button>
        </div>

        {activeTab === 'input' && (
          <div style={styles.content}>
            <div style={styles.section}>
              <h3 style={styles.sectionTitle}><Users size={20}/> 参加メンバー</h3>
              <div style={styles.chipContainer}>
                {members.length === 0 && <span style={{color:'#94a3b8'}}>メンバーを追加してください</span>}
                {members.map(m => (
                  <span key={m.id} style={styles.chip}>
                    {m.name} <button onClick={() => removeMember(m.id)} style={styles.deleteBtn}><Trash2 size={14}/></button>
                  </span>
                ))}
              </div>
              <div style={styles.inputGroup}>
                <input 
                  style={styles.input}
                  value={newMemberName}
                  onChange={(e) => setNewMemberName(e.target.value)}
                  placeholder="名前を入力"
                  onKeyDown={(e) => e.key === 'Enter' && addMember()}
                />
                <button onClick={addMember} style={styles.btnPrimary} disabled={!user}>追加</button>
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
                        <td style={styles.td}>
                          <input style={{...styles.inputTable, borderBottom: '1px solid #ddd'}} value={e.item} onChange={ev => updateExpense(e.id, 'item', ev.target.value)} />
                        </td>
                        <td style={styles.td}>
                          <input type="number" style={styles.inputTable} value={e.budget} onChange={ev => updateExpense(e.id, 'budget', Number(ev.target.value))} />
                        </td>
                        <td style={styles.td}>
                          <input type="number" style={{...styles.inputTable, fontWeight:'bold', color: e.actual > e.budget ? '#ef4444' : 'inherit'}} value={e.actual} onChange={ev => updateExpense(e.id, 'actual', Number(ev.target.value))} />
                        </td>
                        <td style={styles.td}>
                          <select style={styles.inputTable} value={e.payer} onChange={ev => updateExpense(e.id, 'payer', ev.target.value)}>
                            <option value="各自">各自</option>
                            {members.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                          </select>
                        </td>
                        <td style={styles.td}>
                          <select style={styles.inputTable} value={e.splitType} onChange={ev => updateExpense(e.id, 'splitType', ev.target.value)}>
                            <option value="split">割勘</option>
                            <option value="individual">個人</option>
                          </select>
                        </td>
                        <td style={{...styles.td, textAlign:'center'}}>
                          <button onClick={() => removeExpense(e.id)} style={{...styles.deleteBtn, color:'#ef4444'}}><Trash2 size={16}/></button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button onClick={addExpense} style={{...styles.btnPrimary, marginTop: '20px', display:'flex', alignItems:'center', gap:'8px'}}>
                <Plus size={16}/> 行を追加
              </button>
            </div>
          </div>
        )}

        {activeTab === 'report' && (
          <div style={styles.content}>
            <div style={styles.reportGrid}>
              <div style={styles.reportCard}>
                <h3 style={{...styles.sectionTitle, borderBottom:'1px solid #eee', paddingBottom:'10px'}}>内訳サマリー</h3>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                  <span style={{color:'#64748b'}}>割勘対象 総額</span>
                  <strong>¥{totalSharedCost.toLocaleString()}</strong>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginBottom:'10px'}}>
                  <span style={{color:'#64748b'}}>人数</span>
                  <strong>{members.length} 名</strong>
                </div>
                <div style={{display:'flex', justifyContent:'space-between', marginTop:'15px', paddingTop:'15px', borderTop:'1px solid #eee', color:'#2563eb', fontSize:'18px'}}>
                  <strong>1人あたり</strong>
                  <strong>¥{Math.round(perPersonShare).toLocaleString()}</strong>
                </div>
              </div>

              <div style={{...styles.reportCard, borderColor: '#bfdbfe', boxShadow: '0 0 0 1px #bfdbfe'}}>
                <h3 style={{...styles.sectionTitle, color:'#1e40af'}}>送金リスト</h3>
                {transactions.length === 0 ? (
                  <div style={{textAlign:'center', padding:'20px', color:'#94a3b8'}}>精算なし</div>
                ) : (
                  <div>
                    {transactions.map((t, idx) => (
                      <div key={idx} style={styles.transaction}>
                        <div style={{display:'flex', alignItems:'center', gap:'8px'}}>
                          <strong>{t.from}</strong>
                          <ArrowRight size={16} style={styles.arrow} />
                          <strong>{t.to}</strong>
                        </div>
                        <strong style={{color:'#2563eb', fontSize:'18px'}}>¥{t.amount.toLocaleString()}</strong>
                      </div>
                    ))}
                  </div>
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