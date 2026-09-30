/**
 * Opens one confirmed Case for a Sample Kitchen store manager when a weather-driven inventory
 * check found items that won't cover the forecast. The case contents come from the workbench,
 * and they're trusted only because their SHA-256 hash is the request hash inside the signed,
 * unexpired, same-user confirmation. Creates as the user and reads the Case back.
 */
global with sharing class WorkbenchCreateInventoryCase {
    global class Input {
        @InvocableVariable(required=true label='Location Key' description='location:<city id> for the Sample Kitchen location the case is about.') global String locationKey;
        @InvocableVariable(required=true label='Case Details JSON' description='The confirmed case contents; their SHA-256 hash must equal the request hash.') global String caseDetailsJson;
        @InvocableVariable(required=true label='Confirmation ID' description='Versioned, unexpired, same-user signed confirmation token issued by the Workbench host.') global String confirmationId;
        @InvocableVariable(required=true label='Request Hash' description='SHA-256 hash of the case details JSON, bound into the signed confirmation.') global String requestHash;
        @InvocableVariable(required=true label='Idempotency Key' description='Unique replay-safe key for this confirmed case.') global String idempotencyKey;
    }
    global class Output {
        @InvocableVariable(label='Case ID' description='Salesforce Case ID read back after creation or replay.') global Id caseId;
        @InvocableVariable(label='Case Number' description='The Case number read back from Salesforce.') global String caseNumber;
        @InvocableVariable(label='Subject' description='The Case subject read back from Salesforce.') global String subject;
        @InvocableVariable(label='Priority' description='The Case priority read back from Salesforce.') global String priority;
        @InvocableVariable(label='Status' description='The Case status read back from Salesforce.') global String status;
        @InvocableVariable(label='Contact Name' description='The store manager the Case is for.') global String contactName;
        @InvocableVariable(label='Location Key' description='The location the Case is about.') global String locationKey;
        @InvocableVariable(label='Idempotent Replay' description='True when this idempotency key already identified a Case and no duplicate was created.') global Boolean replayed;
        @InvocableVariable(label='Authoritative Read Back' description='True only after Salesforce successfully reads back the Case.') global Boolean readBack;
    }

    private class Details {
        String locationId;
        String city;
        String managerName;
        Window window;
        List<String> conditions;
        List<Item> items;
    }
    private class Window {
        String fromDate;
        String toDate;
        Integer days;
    }
    private class Item {
        String name;
        String unit;
        Decimal onHand;
        Decimal onOrder;
        Decimal projectedNeed;
        List<String> menuItems;
    }

    @InvocableMethod(label='Create Inventory Case' description='Opens one idempotent Case for a store manager after host confirmation.')
    global static List<Output> run(List<Input> inputs) {
        List<Output> results = new List<Output>();
        for (Input item : inputs) {
            if (item == null) throw new InventoryCaseException('Confirmation and case fields are required.');
            try {
                WorkbenchConfirmationVerifier.requireValidFor(
                    'create-inventory-case', item.locationKey, item.confirmationId, item.requestHash,
                    item.idempotencyKey
                );
            } catch (WorkbenchConfirmationVerifier.ConfirmationException error) {
                throw new InventoryCaseException(error.getMessage());
            }
            String digest = EncodingUtil.convertToHex(
                Crypto.generateDigest('SHA-256', Blob.valueOf(item.caseDetailsJson))
            ).toLowerCase();
            if (digest != item.requestHash.toLowerCase()) {
                throw new InventoryCaseException('The case details do not match the confirmed request.');
            }
            Details details = parse(item.caseDetailsJson);
            if ('location:' + details.locationId != item.locationKey || details.items == null || details.items.isEmpty()) {
                throw new InventoryCaseException('The case details do not match the confirmed location.');
            }
            List<Case> existing = [
                SELECT Id FROM Case WHERE Workbench_Idempotency_Key__c = :item.idempotencyKey WITH USER_MODE LIMIT 1
            ];
            Boolean replayed = !existing.isEmpty();
            Id caseId;
            if (replayed) caseId = existing[0].Id;
            else {
                // The manager is found by role and restaurant; the workbench never handles contact data.
                String store = 'Sample Kitchen ' + details.city;
                List<Contact> managers = [
                    SELECT Id, AccountId, Name FROM Contact
                    WHERE Title = 'Store Manager' AND Department = :store
                    WITH USER_MODE ORDER BY CreatedDate DESC LIMIT 1
                ];
                if (managers.isEmpty()) {
                    throw new InventoryCaseException('The store manager is not a Contact in Salesforce.');
                }
                Case inventoryCase = new Case(
                    ContactId = managers[0].Id,
                    AccountId = managers[0].AccountId,
                    Subject = truncate('Low stock before forecast weather: Sample Kitchen ' + details.city, 255),
                    Description = description(details),
                    Priority = urgent(details) ? 'High' : 'Medium',
                    Status = 'New',
                    Workbench_Idempotency_Key__c = item.idempotencyKey
                );
                insert as user inventoryCase;
                caseId = inventoryCase.Id;
            }
            Case readBack = [
                SELECT Id, CaseNumber, Subject, Priority, Status, Description, Contact.Name
                FROM Case WHERE Id = :caseId WITH USER_MODE
            ];
            if (String.isBlank(readBack.CaseNumber) || String.isBlank(readBack.Subject) || String.isBlank(readBack.Description)) {
                throw new InventoryCaseException('Salesforce Case read-back was incomplete.');
            }
            Output result = new Output();
            result.caseId = readBack.Id;
            result.caseNumber = readBack.CaseNumber;
            result.subject = readBack.Subject;
            result.priority = readBack.Priority;
            result.status = readBack.Status;
            result.contactName = readBack.Contact?.Name;
            result.locationKey = item.locationKey;
            result.replayed = replayed;
            result.readBack = true;
            results.add(result);
        }
        return results;
    }

    private static Details parse(String json) {
        try {
            // "from" and "to" are reserved words in Apex, so the window keys are renamed.
            String normalized = json.replace('"from":', '"fromDate":').replace('"to":', '"toDate":');
            return (Details) System.JSON.deserialize(normalized, Details.class);
        } catch (Exception error) {
            throw new InventoryCaseException('The case details are not valid.');
        }
    }

    /** High when any item has less than half of what the forecast needs, counting deliveries. */
    private static Boolean urgent(Details details) {
        for (Item item : details.items) {
            Decimal available = (item.onHand == null ? 0 : item.onHand) + (item.onOrder == null ? 0 : item.onOrder);
            if (item.projectedNeed != null && available * 2 < item.projectedNeed) return true;
        }
        return false;
    }

    private static String description(Details details) {
        List<String> lines = new List<String>{
            'Inventory check by Marketing Workbench (confirmed by a user)', '',
            'Location: Sample Kitchen ' + details.city,
            'Forecast window: ' + details.window.fromDate + ' to ' + details.window.toDate +
                ' (' + details.window.days + ' days; ' + String.join(details.conditions, ', ') + ')', '',
            'Items that will not cover the forecast, counting deliveries on order (' + details.items.size() + ')'
        };
        for (Item item : details.items) {
            lines.add('- ' + item.name + ': ' + item.onHand + ' ' + item.unit + ' on hand, ' +
                (item.onOrder == null ? 0 : item.onOrder) + ' on order, ' + item.projectedNeed +
                ' needed (' + String.join(item.menuItems, ', ') + ')');
        }
        lines.addAll(new List<String>{
            '', 'Next steps',
            '1. Confirm the counts on hand.',
            '2. Place or expedite orders for the items above.',
            '3. Update this case with what was ordered and when it arrives.', '',
            'Stock counts come from the store inventory system; demand lift comes from past results by weather.'
        });
        return truncate(String.join(lines, '\n'), 32000);
    }

    private static String truncate(String value, Integer maximumLength) {
        return value.length() <= maximumLength ? value : value.substring(0, maximumLength);
    }

    public class InventoryCaseException extends Exception {}
}
