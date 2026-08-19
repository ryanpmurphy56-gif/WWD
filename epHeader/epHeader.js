import { LightningElement, api, wire } from 'lwc';
import getCurrentUser from '@salesforce/apex/EmployeePortalController.getCurrentUser';
import HAS_MANAGER_PERMISSION from '@salesforce/customPermission/Manage_Roster';

export default class EpHeader extends LightningElement {
    @api activeTab = 'dashboard';
    userName = '';
    userPhoto = '';

    @wire(getCurrentUser)
    wiredUser({ data }) {
        if (data) {
            this.userName = data.Name;
            this.userPhoto = data.SmallPhotoUrl;
        }
    }

    get isManager() {
        return HAS_MANAGER_PERMISSION;
    }

    get dashClass()     { return this.activeTab === 'dashboard' ? 'nav-btn active' : 'nav-btn'; }
    get shiftsClass()   { return this.activeTab === 'shifts'    ? 'nav-btn active' : 'nav-btn'; }
    get scheduleClass() { return this.activeTab === 'schedule'  ? 'nav-btn active' : 'nav-btn'; }
    get timeOffClass()  { return this.activeTab === 'timeoff'   ? 'nav-btn active' : 'nav-btn'; }
    get managerClass()  { return this.activeTab === 'manager'   ? 'nav-btn manager-btn active' : 'nav-btn manager-btn'; }

    handleNav(event) {
        const tab = event.target.dataset.tab;
        this.dispatchEvent(new CustomEvent('navigate', { detail: tab }));
    }
}