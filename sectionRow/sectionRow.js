/**
 * sectionRow — the layout container: a row of columns, each holding any number
 * of child sections (including other rows).
 *
 * Its content shape is `{ columns: [{ colId, span, children: [...] }] }`, where
 * span is in 12ths of the row. Children are full section nodes, so anything
 * that renders at the top level renders inside a column, and the store's
 * mutators reach them through the same recursive walk.
 *
 * It renders <c-section-slot> per child; sectionSlot renders <c-section-row>
 * for a 'row' node. That circular pair is what buys arbitrary nesting depth
 * without dynamic components -- see the note in sectionSlot.js.
 *
 * Gap lives in `style` (not content) so it inherits the breakpoint machinery
 * for free: columns can be tight on mobile and airy on desktop.
 */
import { LightningElement, api } from 'lwc';
import store from 'c/siteStateService';
import { sectionRootClass, sectionRootStyle, blockStyle } from 'c/sectionCommon';

/** Per-column flex shorthand for flex mode, from the column's width mode. */
function colFlex(col) {
    if (col.widthMode === 'auto') {
        return '0 1 auto';
    }
    if (col.widthMode === 'percent') {
        return `0 1 ${Math.max(1, Math.min(100, Number(col.percent) || 50))}%`;
    }
    return `${col.span || 6} 1 0%`;
}

export default class SectionRow extends LightningElement {
    @api node;
    @api pageId;
    @api mode = 'edit';
    @api selectedSectionIds;
    @api draggingSectionIds;
    @api globals;
    @api navMenu;
    @api siteId;

    // Column currently highlighted as a drop target, while a drag is live.
    dropColId = null;

    get isEdit() {
        return this.mode === 'edit';
    }
    get sectionId() {
        return this.node?.sectionId;
    }
    get sectionStyle() {
        return this.node?.style;
    }

    get rootClass() {
        return sectionRootClass('sec_row', {
            variant: this.node?.variant,
            style: this.sectionStyle,
            layout: this.node?.layout,
            mode: this.mode
        });
    }
    get rootStyle() {
        return sectionRootStyle(this.sectionStyle);
    }
    get blockStyle() {
        return blockStyle(this.node?.layout);
    }

    // ---- layout modes ------------------------------------------------------
    // 'columns' (the original 12-col grid), 'flex', or 'grid'. Absent means
    // 'columns', so configs saved before modes existed render unchanged.

    get layoutMode() {
        const mode = this.node?.content?.layoutMode;
        return mode === 'flex' || mode === 'grid' ? mode : 'columns';
    }

    /**
     * A column set to percent or auto width can't sit on the shared 12-col
     * track, so any such column switches the whole row to explicit per-column
     * tracks (one track per column, built in colsStyle below).
     */
    get hasCustomTracks() {
        return (this.node?.content?.columns || []).some(
            (c) => c.widthMode === 'percent' || c.widthMode === 'auto'
        );
    }

    get colsClass() {
        if (this.layoutMode === 'flex') {
            return 'row__cols row__cols_flex';
        }
        if (this.layoutMode === 'grid') {
            return 'row__cols row__cols_grid';
        }
        return this.hasCustomTracks ? 'row__cols row__cols_tracks' : 'row__cols';
    }

    /**
     * Container-level layout settings, emitted as custom properties (never the
     * real CSS properties): the container queries that stack everything on
     * mobile set the real properties directly, and an inline declaration would
     * outrank them.
     */
    get colsStyle() {
        const content = this.node?.content || {};
        if (this.layoutMode === 'flex') {
            const f = content.flex || {};
            const justify =
                { start: 'flex-start', center: 'center', end: 'flex-end', between: 'space-between', around: 'space-around' }[
                    f.justify
                ] || 'flex-start';
            const align = { stretch: 'stretch', start: 'flex-start', center: 'center', end: 'flex-end' }[f.align] || 'stretch';
            const dir = f.direction === 'column' ? 'column' : 'row';
            const wrap = f.wrap === false ? 'nowrap' : 'wrap';
            return `--row-dir:${dir};--row-wrap:${wrap};--row-justify:${justify};--row-align:${align};`;
        }
        if (this.layoutMode === 'grid') {
            const n = Math.max(1, Math.min(6, Number(content.gridCols) || 3));
            return `--row-grid-n:${n};`;
        }
        if (this.hasCustomTracks) {
            // Percent goes out as fr, not %: a literal 30% + column gap would
            // overflow the row, while 30fr/70fr keeps the stated proportion and
            // absorbs the gap. Auto sizes the track to its content.
            const tracks = (content.columns || [])
                .map((c) => {
                    if (c.widthMode === 'auto') {
                        return 'auto';
                    }
                    if (c.widthMode === 'percent') {
                        return `minmax(0,${Math.max(1, Math.min(100, Number(c.percent) || 50))}fr)`;
                    }
                    return `minmax(0,${c.span || 6}fr)`;
                })
                .join(' ');
            return `--row-tracks:${tracks};`;
        }
        return '';
    }

    get columns() {
        const cols = this.node?.content?.columns || [];
        const mode = this.layoutMode;
        const tracks = this.hasCustomTracks;
        return cols.map((col) => {
            // Sizing goes out as custom properties, not literal grid-column /
            // flex: inline declarations would outrank the container query that
            // stacks the columns on mobile. In tracks/grid mode the column is
            // placed by the track list, so it carries no sizing of its own.
            let style = '';
            if (mode === 'flex') {
                style = `--col-flex:${colFlex(col)};`;
            } else if (mode === 'columns' && !tracks) {
                style = `--col-span:${col.span || Math.floor(12 / (cols.length || 1))};`;
            }
            // Same edit-vs-preview hidden filter as pageCanvas.sections: stays
            // visible (dimmed) in edit mode, dropped entirely in Preview.
            const kids = this.isEdit
                ? col.children || []
                : (col.children || []).filter((c) => !(c.flags && c.flags.hidden));
            return {
                ...col,
                key: col.colId,
                style,
                colClass: this.dropColId === col.colId ? 'row__col row__col_drop' : 'row__col',
                children: kids.map((child, index) => ({
                    ...child,
                    key: child.sectionId,
                    index,
                    isFirst: index === 0,
                    isLast: index === kids.length - 1
                })),
                isEmpty: !kids.length
            };
        });
    }

    handleAddToColumn(event) {
        event.stopPropagation();
        const { colId } = event.currentTarget.dataset;
        store.addSectionToColumn(this.pageId, this.sectionId, colId, 'textBlock');
    }

    // Nest a fresh columns container inside this column — containers nest to
    // any depth (the sectionSlot ↔ sectionRow recursion terminates on data).
    handleAddRowToColumn(event) {
        event.stopPropagation();
        const { colId } = event.currentTarget.dataset;
        store.addSectionToColumn(this.pageId, this.sectionId, colId, 'row');
    }

    // ---- drop target: the column itself ------------------------------------
    // Fires for pointer moves over column chrome (the hint, the add button, the
    // gaps) — moves over a child slot never get here, because the slot claims
    // them with stopPropagation first. Dropping on the column = append at end.

    handleColMove(event) {
        if (!(this.draggingSectionIds && this.draggingSectionIds.length)) {
            return;
        }
        event.stopPropagation();
        const { colId } = event.currentTarget.dataset;
        if (this.dropColId !== colId) {
            this.dropColId = colId;
            const col = (this.node?.content?.columns || []).find((c) => c.colId === colId);
            this.dispatchEvent(
                new CustomEvent('sectiondragover', {
                    detail: {
                        target: { rowId: this.sectionId, colId, index: (col?.children || []).length }
                    },
                    bubbles: true,
                    composed: true
                })
            );
        }
    }

    handleColLeave() {
        this.dropColId = null;
    }

    // A child slot inside this column claimed the target; its event bubbles
    // through the column div on its way up — clear the column highlight.
    handleChildDragOver() {
        if (this.dropColId) {
            this.dropColId = null;
        }
    }
}