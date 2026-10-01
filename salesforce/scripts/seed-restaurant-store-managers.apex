// Seeds the restaurant's store managers as Contacts, so inventory cases have someone to go to.
// Fictional people with non-deliverable example.invalid addresses. Safe to run again.
Map<String, List<String>> managers = new Map<String, List<String>>{
    'rosa.delgado@restaurant.example.invalid' => new List<String>{ 'Rosa', 'Delgado', 'Los Angeles' },
    'marcus.lee@restaurant.example.invalid' => new List<String>{ 'Marcus', 'Lee', 'San Francisco' },
    'priya.nair@restaurant.example.invalid' => new List<String>{ 'Priya', 'Nair', 'San Diego' },
    'tom.okafor@restaurant.example.invalid' => new List<String>{ 'Tom', 'Okafor', 'Sacramento' },
    'elena.ruiz@restaurant.example.invalid' => new List<String>{ 'Elena', 'Ruiz', 'Fresno' }
};
List<Account> accounts = [SELECT Id FROM Account WHERE Name = 'Restaurant (fictional)' LIMIT 1];
Account restaurant = accounts.isEmpty() ? new Account(Name = 'Restaurant (fictional)') : accounts[0];
upsert restaurant;
Map<String, Contact> existing = new Map<String, Contact>();
for (Contact contact : [SELECT Id, Email FROM Contact WHERE Email IN :managers.keySet()]) existing.put(contact.Email, contact);
List<Contact> upserts = new List<Contact>();
for (String email : managers.keySet()) {
    List<String> person = managers.get(email);
    Contact contact = existing.containsKey(email) ? existing.get(email) : new Contact(Email = email);
    contact.FirstName = person[0];
    contact.LastName = person[1];
    contact.Title = 'Store Manager';
    contact.Department = 'Store ' + person[2];
    contact.AccountId = restaurant.Id;
    upserts.add(contact);
}
upsert upserts;
System.debug('SEEDED ' + upserts.size() + ' store managers on ' + restaurant.Id);
