import { LightningElement, track, wire } from 'lwc';
import getMyShifts from '@salesforce/apex/EmployeePortalController.getMyShifts';

export default class EpMyShifts extends LightningElement {
    @track shifts = [];
    @track currentView = 'list';
    @track weekOffset = 0;

    @wire(getMyShifts)
    wiredShifts({ data }) {
        if (data) {
            this.shifts = data.map(s => {
                const start = new Date(s.Start_Time__c);
                const end = new Date(s.End_Time__c);
                return {
                    ...s,
                    _dayOfWeek: start.toLocaleDateString('en-AU', { weekday: 'short' }),
                    _dateFormatted: start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }),
                    _startTime: start.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
                    _endTime: end.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' }),
                    _statusClass: 'status-badge status-' + (s.Status__c || '').toLowerCase().replace(' ', '-')
                };
            });
        }
    }

    get isListView() { return this.currentView === 'list'; }
    get isCalendarView() { return this.currentView === 'calendar'; }
    get hasShifts() { return this.shifts && this.shifts.length > 0; }

    get calendarTitle() {
        const now = new Date();
        now.setDate(now.getDate() + this.weekOffset * 7);
        const start = new Date(now);
        start.setDate(start.getDate() - start.getDay() + 1);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        return start.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) +
               ' — ' + end.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
    }

    get calendarDays() {
        const now = new Date();
        now.setDate(now.getDate() + this.weekOffset * 7);
        const monday = new Date(now);
        monday.setDate(monday.getDate() - monday.getDay() + 1);

        const days = [];
        for (let i = 0; i < 7; i++) {
            const day = new Date(monday);
            day.setDate(day.getDate() + i);
            const dayShifts = this.shifts.filter(s => {
                const shiftDate = new Date(s.Start_Time__c);
                return shiftDate.toDateString() === day.toDateString();
            });
            days.push({
                label: day.toISOString(),
                dayName: day.toLocaleDateString('en-AU', { weekday: 'short' }),
                dayNum: day.getDate(),
                shifts: dayShifts
            });
        }
        return days;
    }

    handleViewToggle(event) {
        this.currentView = event.target.dataset.view;
    }

    prevWeek() { this.weekOffset -= 1; }
    nextWeek() { this.weekOffset += 1; }
}