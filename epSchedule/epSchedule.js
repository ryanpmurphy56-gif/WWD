import { LightningElement, track, wire } from 'lwc';
import getAllShifts from '@salesforce/apex/EmployeePortalController.getAllShifts';
import getEmployees from '@salesforce/apex/EmployeePortalController.getEmployees';

export default class EpSchedule extends LightningElement {

    @track weekOffset = 0;
    @track allShifts   = [];
    @track employees   = [];
    @track isLoading   = true;
    @track selectedShift = null;

    // ── Employees (static list, doesn't need to reload per week) ──────────
    @wire(getEmployees)
    wiredEmployees({ data, error }) {
        if (data) {
            this.employees = data;
            this._loadShifts();
        } else if (error) {
            console.error('getEmployees error:', error);
            this.isLoading = false;
        }
    }

    // ── Week boundary helpers ──────────────────────────────────────────────
    get _monday() {
        const d = new Date();
        d.setDate(d.getDate() + this.weekOffset * 7);
        const day = d.getDay();
        const diff = day === 0 ? -6 : 1 - day;   // Monday = 1
        d.setDate(d.getDate() + diff);
        d.setHours(0, 0, 0, 0);
        return d;
    }

    get _sunday() {
        const d = new Date(this._monday);
        d.setDate(d.getDate() + 6);
        d.setHours(23, 59, 59, 0);
        return d;
    }

    // ── Load shifts for displayed week ────────────────────────────────────
    _loadShifts() {
        this.isLoading = true;
        const startStr = this._toDateString(this._monday);
        const endStr   = this._toDateString(this._sunday);

        getAllShifts({ startDate: startStr, endDate: endStr })
            .then(data => {
                this.allShifts = data.map(s => this._decorateShift(s));
                this.isLoading = false;
            })
            .catch(err => {
                console.error('getAllShifts error:', err);
                this.isLoading = false;
            });
    }

    // ── Decorate a shift record with display helpers ───────────────────────
    _decorateShift(s) {
        const start = new Date(s.Start_Time__c);
        const end   = new Date(s.End_Time__c);
        const statusKey = (s.Status__c || 'scheduled').toLowerCase().replace(/ /g, '-');
        return {
            ...s,
            _startTime: start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
            _endTime:   end.toLocaleTimeString('en-AU',   { hour: '2-digit', minute: '2-digit' }),
            _fullDate:  start.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' }),
            _dateKey:   this._toDateString(start),          // 'YYYY-MM-DD' for bucketing
            _pillClass: `shift-pill status-${statusKey}`
        };
    }

    // ── Week label shown in toolbar ───────────────────────────────────────
    get weekRangeLabel() {
        const mon = this._monday;
        const sun = this._sunday;
        const fmt = d => d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
        return `${fmt(mon)} – ${fmt(sun)}, ${sun.getFullYear()}`;
    }

    // ── Seven day objects for the header row ──────────────────────────────
    get weekDays() {
        const todayStr = this._toDateString(new Date());
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(this._monday);
            d.setDate(d.getDate() + i);
            const iso = this._toDateString(d);
            days.push({
                iso,
                dayName:     d.toLocaleDateString('en-AU', { weekday: 'short' }).toUpperCase(),
                dayNum:      d.getDate(),
                headerClass: `day-header${iso === todayStr ? ' today' : ''}`
            });
        }
        return days;
    }

    // ── Build roster rows (one per employee) ──────────────────────────────
    get rosterRows() {
        const todayStr = this._toDateString(new Date());
        const days = this.weekDays;

        return this.employees.map(emp => {
            // Shifts belonging to this employee this week
            const empShifts = this.allShifts.filter(s => s.Staff_Member__c === emp.Id);

            // Build a day-cell for each column
            const dayCells = days.map(day => ({
                iso:       day.iso,
                cellClass: `day-cell${day.iso === todayStr ? ' today-col' : ''}`,
                shifts:    empShifts.filter(s => s._dateKey === day.iso)
            }));

            return {
                employeeId: emp.Id,
                name:       emp.Name,
                title:      emp.Title || '',
                photoUrl:   emp.SmallPhotoUrl || '',
                days:       dayCells
            };
        });
    }

    get hasRows() {
        return this.rosterRows && this.rosterRows.length > 0;
    }

    // ── Navigation ────────────────────────────────────────────────────────
    prevWeek() {
        this.weekOffset -= 1;
        this._loadShifts();
    }

    nextWeek() {
        this.weekOffset += 1;
        this._loadShifts();
    }

    goToToday() {
        this.weekOffset = 0;
        this._loadShifts();
    }

    // ── Shift click → popover ─────────────────────────────────────────────
    handleShiftClick(event) {
        event.stopPropagation();
        const shiftId = event.currentTarget.dataset.id;
        this.selectedShift = this.allShifts.find(s => s.Id === shiftId) || null;
    }

    closePopover() {
        this.selectedShift = null;
    }

    stopPropagation(event) {
        event.stopPropagation();
    }

    // ── Utility ───────────────────────────────────────────────────────────
    _toDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}