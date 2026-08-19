import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getEmployees from '@salesforce/apex/EmployeePortalController.getEmployees';
import getAllShifts from '@salesforce/apex/EmployeePortalController.getAllShifts';
import createShift from '@salesforce/apex/EmployeePortalController.createShift';
import deleteShift from '@salesforce/apex/EmployeePortalController.deleteShift';

export default class EpManager extends LightningElement {
    @track activeTab      = 'shifts';
    @track employees      = [];
    @track upcomingShifts = [];
    @track isShiftsLoading = true;

    // Form fields
    @track employeeId = '';
    @track role       = '';
    @track startTime  = '';
    @track endTime    = '';

    // ── Employees ────────────────────────────────────────────────────────
    @wire(getEmployees)
    wiredEmployees({ data, error }) {
        if (data) this.employees = data;
        if (error) console.error('getEmployees error:', error);
    }

    // ── Load shifts on mount ─────────────────────────────────────────────
    connectedCallback() {
        this._loadShifts();
    }

    _loadShifts() {
        this.isShiftsLoading = true;
        const today = new Date();
        const startStr = this._toDateString(today);
        // Load 4 weeks ahead
        const end = new Date();
        end.setDate(end.getDate() + 28);
        const endStr = this._toDateString(end);

        getAllShifts({ startDate: startStr, endDate: endStr })
            .then(data => {
                this.upcomingShifts = data.map(s => this._decorate(s));
                this.isShiftsLoading = false;
            })
            .catch(err => {
                console.error('getAllShifts error:', err);
                this.isShiftsLoading = false;
            });
    }

    _decorate(s) {
        const start = new Date(s.Start_Time__c);
        const end   = new Date(s.End_Time__c);
        const statusKey = (s.Status__c || '').toLowerCase().replace(/ /g, '-');
        return {
            ...s,
            _dateFormatted: start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
            _startTime: start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
            _endTime:   end.toLocaleTimeString('en-AU',   { hour: '2-digit', minute: '2-digit' }),
            _statusClass: `status-badge status-${statusKey}`
        };
    }

    // ── Tab switching ────────────────────────────────────────────────────
    get isShifts()  { return this.activeTab === 'shifts'; }
    get isTimeOff() { return this.activeTab === 'timeoff'; }

    get tabShiftsClass()  { return this.activeTab === 'shifts'  ? 'tab-btn active' : 'tab-btn'; }
    get tabTimeOffClass() { return this.activeTab === 'timeoff' ? 'tab-btn active' : 'tab-btn'; }

    handleTab(event) {
        this.activeTab = event.target.dataset.tab;
    }

    // ── Form input ───────────────────────────────────────────────────────
    handleInput(event) {
        this[event.target.dataset.field] = event.target.value;
    }

    // ── Create shift ─────────────────────────────────────────────────────
    handleCreateShift() {
        if (!this.employeeId || !this.role || !this.startTime || !this.endTime) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Missing Fields',
                message: 'Please fill in all fields before creating a shift.',
                variant: 'warning'
            }));
            return;
        }

        const start = new Date(this.startTime);
        const end   = new Date(this.endTime);

        if (end <= start) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Invalid Times',
                message: 'End time must be after start time.',
                variant: 'warning'
            }));
            return;
        }

        createShift({
            employeeId: this.employeeId,
            startTime:  start.toISOString(),
            endTime:    end.toISOString(),
            role:       this.role
        })
        .then(() => {
            this.dispatchEvent(new ShowToastEvent({
                title: 'Shift Created',
                message: 'The shift has been successfully created.',
                variant: 'success'
            }));
            // Reset form
            this.employeeId = '';
            this.role       = '';
            this.startTime  = '';
            this.endTime    = '';
            this._loadShifts();
        })
        .catch(err => {
            console.error('createShift error:', err);
            this.dispatchEvent(new ShowToastEvent({
                title: 'Error',
                message: err.body?.message || 'Failed to create shift.',
                variant: 'error'
            }));
        });
    }

    // ── Delete shift ─────────────────────────────────────────────────────
    handleDeleteShift(event) {
        const shiftId = event.target.dataset.id;
        deleteShift({ shiftId })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Shift Deleted',
                    message: 'The shift has been removed.',
                    variant: 'success'
                }));
                this._loadShifts();
            })
            .catch(err => {
                console.error('deleteShift error:', err);
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Error',
                    message: err.body?.message || 'Failed to delete shift.',
                    variant: 'error'
                }));
            });
    }

    // ── Getters ──────────────────────────────────────────────────────────
    get hasShifts()   { return this.upcomingShifts && this.upcomingShifts.length > 0; }
    get shiftCount()  { return this.upcomingShifts ? this.upcomingShifts.length : 0; }

    // ── Utility ──────────────────────────────────────────────────────────
    _toDateString(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }
}