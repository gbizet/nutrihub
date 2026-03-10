import React, { useMemo, useState } from 'react';
import styles from '../pages/dashboard.module.css';

const SPANS = [3, 4, 6, 8, 9, 12];

const normalizeLayout = (saved, blocks) => {
  const ids = blocks.map((block) => block.id);
  const map = new Map((Array.isArray(saved) ? saved : []).map((item) => [item.id, item]));
  return ids.map((id) => {
    const existing = map.get(id);
    const fallback = blocks.find((block) => block.id === id);
    return {
      id,
      span: SPANS.includes(existing?.span) ? existing.span : fallback?.defaultSpan || 12,
    };
  });
};

export default function LayoutBlocks({ pageId, state, setState, blocks }) {
  const [editMode, setEditMode] = useState(false);

  const layout = useMemo(
    () => normalizeLayout(state.layouts?.[pageId], blocks),
    [blocks, pageId, state.layouts],
  );

  const blockMap = useMemo(() => new Map(blocks.map((block) => [block.id, block])), [blocks]);
  const orderedBlocks = useMemo(() => layout.map((item) => ({ ...item, block: blockMap.get(item.id) })), [blockMap, layout]);

  const persistLayout = (nextLayout) => {
    setState((prev) => ({
      ...prev,
      layouts: {
        ...(prev.layouts || {}),
        [pageId]: nextLayout,
      },
    }));
  };

  const move = (id, direction) => {
    const index = layout.findIndex((item) => item.id === id);
    if (index < 0) return;
    const target = direction === 'up' ? index - 1 : index + 1;
    if (target < 0 || target >= layout.length) return;
    const next = [...layout];
    [next[index], next[target]] = [next[target], next[index]];
    persistLayout(next);
  };

  const resize = (id, span) => {
    const next = layout.map((item) => (item.id === id ? { ...item, span } : item));
    persistLayout(next);
  };

  const reset = () => persistLayout(normalizeLayout([], blocks));

  return (
    <>
      <div className={styles.layoutToolbar}>
        <button className={styles.tinyButton} type="button" onClick={() => setEditMode((value) => !value)}>
          {editMode ? 'Fermer personnalisation' : 'Personnaliser page'}
        </button>
        {editMode && (
          <button className={styles.tinyButton} type="button" onClick={reset}>
            Reinitialiser layout
          </button>
        )}
      </div>
      <div className={styles.layoutBoard}>
        {orderedBlocks.map((item, index) => (
          <div key={item.id} className={`${styles.layoutItem} ${styles[`layoutSpan${item.span}`]}`}>
            {editMode && (
              <div className={styles.layoutItemBar}>
                <strong>{item.block?.label || item.id}</strong>
                <div className={styles.layoutActions}>
                  <button className={styles.tinyButton} type="button" disabled={index === 0} onClick={() => move(item.id, 'up')}>
                    Haut
                  </button>
                  <button className={styles.tinyButton} type="button" disabled={index === orderedBlocks.length - 1} onClick={() => move(item.id, 'down')}>
                    Bas
                  </button>
                  <select className={styles.layoutSelect} value={item.span} onChange={(e) => resize(item.id, Number(e.target.value))}>
                    {SPANS.map((span) => (
                      <option key={span} value={span}>
                        Largeur {span}/12
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
            {item.block?.render?.()}
          </div>
        ))}
      </div>
    </>
  );
}
