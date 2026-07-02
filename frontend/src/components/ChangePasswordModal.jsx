import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/api/client';
import SlideOver from './SlideOver';

export default function ChangePasswordModal({ open, onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (form.newPassword.length < 8) return toast.error('New password must be at least 8 characters');
    if (form.newPassword !== form.confirm) return toast.error('Passwords do not match');
    setSaving(true);
    try {
      await api.put('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      toast.success('Password changed successfully');
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      onClose();
    } finally { setSaving(false); }
  };

  return (
    <SlideOver open={open} onClose={onClose} title="Change Password" onSubmit={submit} submitting={saving}>
      <div><label className="label">Current Password</label><input required type="password" className="input" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} /></div>
      <div><label className="label">New Password</label><input required type="password" minLength={8} className="input" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} /></div>
      <div><label className="label">Confirm New Password</label><input required type="password" minLength={8} className="input" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} /></div>
    </SlideOver>
  );
}
