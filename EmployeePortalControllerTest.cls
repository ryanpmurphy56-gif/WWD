@isTest
private class EmployeePortalControllerTest {

    @isTest
    static void shiftLifecycle() {
        Id me = UserInfo.getUserId();

        Roster_Shifts__c shift = EmployeePortalController.createShift(
            me, Datetime.now().addHours(1), Datetime.now().addHours(5), 'Floor');
        System.assertNotEquals(null, shift.Id);

        // Overlapping shift for the same person is rejected
        Boolean threw = false;
        try {
            EmployeePortalController.createShift(me, Datetime.now().addHours(2), Datetime.now().addHours(6), 'Floor');
        } catch (AuraHandledException e) { threw = true; }
        System.assert(threw, 'conflict detection must reject overlaps');

        System.assertEquals(1, EmployeePortalController.getMyShifts().size());
        System.assertNotEquals(null, EmployeePortalController.getNextShift());
        System.assertEquals(1, EmployeePortalController.getUpcomingShifts().size());

        EmployeePortalController.punchIn(shift.Id);
        Roster_Shifts__c active = EmployeePortalController.getActiveShift();
        System.assertNotEquals(null, active);
        System.assertEquals('In Progress', [SELECT Status__c FROM Roster_Shifts__c WHERE Id = :shift.Id].Status__c);

        // Double punch-in rejected
        threw = false;
        try { EmployeePortalController.punchIn(shift.Id); } catch (AuraHandledException e) { threw = true; }
        System.assert(threw);

        EmployeePortalController.punchOut(shift.Id);
        System.assertEquals('Completed', [SELECT Status__c FROM Roster_Shifts__c WHERE Id = :shift.Id].Status__c);
        System.assert(EmployeePortalController.getHoursThisWeek() >= 0);

        EmployeePortalController.deleteShift(shift.Id);
        System.assertEquals(0, [SELECT COUNT() FROM Roster_Shifts__c]);
    }

    @isTest
    static void timeOffLifecycle() {
        EmployeePortalController.submitTimeOffRequest(
            Date.today().addDays(7), Date.today().addDays(9), 'Holiday');

        List<Time_Off_Request__c> mine = EmployeePortalController.getMyTimeOffRequests();
        System.assertEquals(1, mine.size());
        System.assertEquals('Pending', mine[0].Status__c);

        List<Time_Off_Request__c> pending = EmployeePortalController.getPendingTimeOffRequests();
        System.assertEquals(1, pending.size());

        EmployeePortalController.updateTimeOffRequest(pending[0].Id, 'Approved', 'Enjoy!');
        System.assertEquals('Approved',
            [SELECT Status__c FROM Time_Off_Request__c WHERE Id = :pending[0].Id].Status__c);
    }

    @isTest
    static void utilityReads() {
        System.assertNotEquals(null, EmployeePortalController.getCurrentUser());
        System.assert(!EmployeePortalController.getEmployees().isEmpty());
        List<Roster_Shifts__c> all = EmployeePortalController.getAllShifts(
            String.valueOf(Date.today()), String.valueOf(Date.today().addDays(28)));
        System.assertEquals(0, all.size());
    }
}