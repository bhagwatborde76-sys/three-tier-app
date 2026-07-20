import { useEffect, useState } from 'react';

const API_URL = import.meta.env.VITE_API_URL || '/api';

export default function App() {
  const [items, setItems] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  const loadItems = async () => {
    try {
      const res = await fetch(`${API_URL}/items`);
      if (!res.ok) throw new Error('Failed to fetch items');
      setItems(await res.json());
    } catch (err) {
      setError(err.message);
    }
  };

  useEffect(() => { loadItems(); }, []);

  const addItem = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      const res = await fetch(`${API_URL}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('Failed to add item');
      setName('');
      loadItems();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div style={{ maxWidth: 480, margin: '40px auto', fontFamily: 'sans-serif' }}>
      <h1>Three-Tier Demo</h1>
      {error && <p style={{ color: 'red' }}>{error}</p>}
      <form onSubmit={addItem}>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="New item" />
        <button type="submit">Add</button>
      </form>
      <ul>
        {items.map((item) => (
          <li key={item.id}>{item.name}</li>
        ))}
      </ul>
    </div>
  );
}
