import { LightningElement, track } from 'lwc';
import HAS_MANAGER_PERMISSION from '@salesforce/customPermission/Manage_Roster';

export default class EpPortal extends LightningElement {
    @track activeTab = 'dashboard';

    get isDashboard() { return this.activeTab === 'dashboard'; }
    get isShifts()    { return this.activeTab === 'shifts'; }
    get isSchedule()  { return this.activeTab === 'schedule'; }
    get isTimeOff()   { return this.activeTab === 'timeoff'; }
    get isManager()   { return this.activeTab === 'manager' && HAS_MANAGER_PERMISSION; }

    handleNavigate(event) {
        const tab = event.detail;
        if (tab === 'manager' && !HAS_MANAGER_PERMISSION) return;
        this.activeTab = tab;
    }
}