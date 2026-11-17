import { useEffect, useState } from 'react';
import { useApp } from '../context/AppContext';
import { UserProfile } from '../types';
import { isEmailLookupQuery, normalizeSearchToken } from '../utils/userLookup';

export function useEmailSearchMatch(rawQuery: string) {
  const { lookupUserByEmail } = useApp();
  const [matchedEmailUser, setMatchedEmailUser] = useState<UserProfile | null>(null);
  const [searchingEmail, setSearchingEmail] = useState(false);
  const [searchedEmail, setSearchedEmail] = useState<string | null>(null);

  useEffect(() => {
    const clean = normalizeSearchToken(rawQuery);
    if (!isEmailLookupQuery(clean)) {
      setMatchedEmailUser(null);
      setSearchingEmail(false);
      setSearchedEmail(null);
      return;
    }

    let cancelled = false;
    setSearchingEmail(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await lookupUserByEmail(clean);
        if (!cancelled) {
          setMatchedEmailUser(found);
          setSearchedEmail(clean);
        }
      } catch {
        if (!cancelled) {
          setMatchedEmailUser(null);
          setSearchedEmail(clean);
        }
      } finally {
        if (!cancelled) {
          setSearchingEmail(false);
        }
      }
    }, 200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [rawQuery]);

  return { matchedEmailUser, searchingEmail, searchedEmail };
}
