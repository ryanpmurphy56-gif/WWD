import { LightningElement, track, wire } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import { refreshApex } from '@salesforce/apex';
import getCurrentUser from '@salesforce/apex/EmployeePortalController.getCurrentUser';
import getNextShift from '@salesforce/apex/EmployeePortalController.getNextShift';
import getHoursThisWeek from '@salesforce/apex/EmployeePortalController.getHoursThisWeek';
import getActiveShift from '@salesforce/apex/EmployeePortalController.getActiveShift';
import getUpcomingShifts from '@salesforce/apex/EmployeePortalController.getUpcomingShifts';
import punchIn from '@salesforce/apex/EmployeePortalController.punchIn';
import punchOut from '@salesforce/apex/EmployeePortalController.punchOut';

export default class EpDashboard extends LightningElement {
    @track userName       = '';
    @track hoursThisWeek  = 0;
    @track nextShiftDate  = 'No upcoming shifts';
    @track nextShiftTime  = '';
    @track isPunchedIn    = false;
    @track punchInTime    = '';
    @track currentStatus  = 'Off Duty';
    @track activeShiftId  = null;
    @track nextShiftId    = null;
    @track notifications  = [];
    @track upcomingShifts = [];

    // Store wire results for refreshApex
    _wiredActiveShift;
    _wiredNextShift;
    _wiredHours;
    _wiredUpcoming;

    @wire(getCurrentUser)
    wiredUser({ data }) {
        if (data) this.userName = data.Name;
    }

    @wire(getHoursThisWeek)
    wiredHours(result) {
        this._wiredHours = result;
        if (result.data !== undefined) {
            this.hoursThisWeek = Number(result.data).toFixed(1);
        }
    }

    @wire(getNextShift)
    wiredNextShift(result) {
        this._wiredNextShift = result;
        if (result.data) {
            const start = new Date(result.data.Start_Time__c);
            const end   = new Date(result.data.End_Time__c);
            this.nextShiftDate = start.toLocaleDateString('en-AU', { weekday: 'long', month: 'short', day: 'numeric' });
            this.nextShiftTime = start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }) +
                                 ' — ' + end.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
            this.nextShiftId = result.data.Id;
        } else {
            this.nextShiftDate = 'No upcoming shifts';
            this.nextShiftTime = '';
            this.nextShiftId = null;
        }
    }

    @wire(getActiveShift)
    wiredActiveShift(result) {
        this._wiredActiveShift = result;
        if (result.data) {
            this.isPunchedIn   = true;
            this.activeShiftId = result.data.Id;
            this.currentStatus = 'On Shift';
            this.punchInTime   = new Date(result.data.Actual_Start_Time__c)
                                    .toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
        } else {
            this.isPunchedIn   = false;
            this.activeShiftId = null;
            this.currentStatus = 'Off Duty';
        }
    }

    @wire(getUpcomingShifts)
    wiredUpcoming(result) {
        this._wiredUpcoming = result;
        if (result.data) {
            this.upcomingShifts = result.data.map(s => {
                const start = new Date(s.Start_Time__c);
                const end   = new Date(s.End_Time__c);
                const statusKey = (s.Status__c || '').toLowerCase().replace(/ /g, '-');
                return {
                    ...s,
                    _datePill:   start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }),
                    _startTime:  start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
                    _endTime:    end.toLocaleTimeString('en-AU',   { hour: '2-digit', minute: '2-digit' }),
                    _statusClass: `status-badge status-${statusKey}`
                };
            });
        }
    }

    // ── Getters ───────────────────────────────────────────────────────────
    get timeOfDay() {
        const h = new Date().getHours();
        if (h < 12) return 'morning';
        if (h < 17) return 'afternoon';
        return 'evening';
    }

    get hasNotifications()   { return this.notifications && this.notifications.length > 0; }
    get hasUpcomingShifts()  { return this.upcomingShifts && this.upcomingShifts.length > 0; }
    get hasScheduledShift()  { return this.nextShiftId !== null; }

    get statusIcon()    { return this.isPunchedIn ? '🟢' : '⚪'; }
    get statusDotClass(){ return this.isPunchedIn ? 'status-dot dot-active' : 'status-dot dot-inactive'; }

    // ── Punch In ──────────────────────────────────────────────────────────
    handlePunchIn() {
        if (!this.nextShiftId) {
            this.dispatchEvent(new ShowToastEvent({
                title: 'No Shift Found',
                message: 'You have no scheduled shift to punch in to.',
                variant: 'warning'
            }));
            return;
        }
        punchIn({ shiftId: this.nextShiftId })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Punched In',
                    message: 'Have a great shift!',
                    variant: 'success'
                }));
                return Promise.all([
                    refreshApex(this._wiredActiveShift),
                    refreshApex(this._wiredNextShift),
                    refreshApex(this._wiredHours),
                    refreshApex(this._wiredUpcoming)
                ]);
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Punch In Failed',
                    message: error.body?.message || 'Something went wrong.',
                    variant: 'error'
                }));
            });
    }

    // ── Punch Out ─────────────────────────────────────────────────────────
    handlePunchOut() {
        punchOut({ shiftId: this.activeShiftId })
            .then(() => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Punched Out',
                    message: 'See you next time!',
                    variant: 'success'
                }));
                return Promise.all([
                    refreshApex(this._wiredActiveShift),
                    refreshApex(this._wiredNextShift),
                    refreshApex(this._wiredHours),
                    refreshApex(this._wiredUpcoming)
                ]);
            })
            .catch(error => {
                this.dispatchEvent(new ShowToastEvent({
                    title: 'Punch Out Failed',
                    message: error.body?.message || 'Something went wrong.',
                    variant: 'error'
                }));
            });
    }
}