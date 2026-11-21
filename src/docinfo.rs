//! Word and character count helpers needed by the document editor.

pub fn word_count(s: &str) -> usize {
    let is_cjk = |c: char| {
        matches!(c as u32,
            0x3400..=0x4dbf | 0x4e00..=0x9fff | 0xf900..=0xfaff | 0x20000..=0x2fa1f
            | 0x3040..=0x30ff | 0xac00..=0xd7af)
    };
    let mut n = 0;
    let mut in_word = false;
    for c in s.chars() {
        let wordy = c.is_alphanumeric() && !is_cjk(c) || (in_word && matches!(c, '\'' | '’' | '-' | '.' | '_'));
        if wordy {
            if !in_word {
                n += 1;
            }
            in_word = true;
            continue;
        }
        in_word = false;
        if c.is_whitespace() || c.is_ascii() || c == '\u{fffc}' {
            continue;
        }
        n += 1;
    }
    n
}

pub fn blocks_word_count(blocks: &[crate::model::Block]) -> usize {
    blocks
        .iter()
        .map(|b| {
            let cells = match &b.kind {
                crate::model::BlockKind::Table(t) => t.rows.iter().flatten().map(|c| blocks_word_count(&c.blocks)).sum(),
                _ => 0,
            };
            word_count(&b.text.text) + blocks_word_count(&b.children) + cells
        })
        .sum()
}
