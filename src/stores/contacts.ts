import { create } from 'zustand';

import * as db from '@/lib/db';
import type { Contact } from '@/lib/types';

interface ContactsState {
  list: Contact[];
  boot: () => Promise<void>;
  upsert: (c: Omit<Contact, 'id'> & { id?: number }) => Promise<void>;
  remove: (id: number) => void;
}

export const useContacts = create<ContactsState>((set, get) => ({
  list: [],

  boot: async () => set({ list: await db.loadContacts() }),

  upsert: async (c) => {
    const id = await db.upsertContact(c);
    const list = get().list;
    const next: Contact = { ...c, phone: c.phone ?? null, line: c.line ?? null, id };
    set({
      list: (c.id ? list.map((x) => (x.id === c.id ? next : x)) : [...list, next]).sort((a, b) =>
        a.name.localeCompare(b.name, 'th'),
      ),
    });
  },

  remove: (id) => {
    set({ list: get().list.filter((x) => x.id !== id) });
    db.deleteContact(id);
  },
}));
