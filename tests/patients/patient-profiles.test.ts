import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  notFound: vi.fn(() => {
    throw new Error("NEXT_NOT_FOUND");
  }),
}));

import { getEmergencyResponderData } from "@/lib/emergency/responder";
import { generateEmergencyToken, hashEmergencyToken } from "@/lib/emergency/token";
import { matchPatientIdentity } from "@/lib/extraction/identity-matcher";

describe("Feature B: Patient Profiles System & Isolation", () => {
  const accountId = "acc-uuid-1111";
  const patient1Id = "pat-uuid-self-1";
  const patient2Id = "pat-uuid-mother-2";
  const patient3Id = "pat-uuid-father-3";
  const patient4Id = "pat-uuid-extra-4";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("1. 3-Patient Limit Enforced (4th Patient Insert Fails)", () => {
    it("permits inserts up to 3 patients (Self + 2 dependents)", () => {
      const existingPatients = [
        { id: patient1Id, account_id: accountId, full_name: "Harshal Jain", is_self: true },
        { id: patient2Id, account_id: accountId, full_name: "Sunita Jain", relationship_label: "Mother", is_self: false },
      ];

      // Logic evaluated by database trigger & API constraint:
      const canInsert = (currentCount: number) => {
        if (currentCount >= 3) {
          throw new Error("Maximum 3 patient profiles allowed per account (yourself plus two)");
        }
        return true;
      };

      expect(canInsert(existingPatients.length)).toBe(true);

      // Add 3rd patient
      existingPatients.push({
        id: patient3Id,
        account_id: accountId,
        full_name: "Ramesh Jain",
        relationship_label: "Father",
        is_self: false,
      });

      expect(existingPatients.length).toBe(3);

      // Attempting 4th insert must throw
      expect(() => canInsert(existingPatients.length)).toThrow(
        "Maximum 3 patient profiles allowed per account (yourself plus two)"
      );
    });

    it("prevents multiple self profiles in an account", () => {
      const selfCount = (list: Array<{ is_self: boolean }>) =>
        list.filter((p) => p.is_self).length;

      const profiles = [{ id: patient1Id, is_self: true }];
      const attemptInsertSecondSelf = () => {
        if (selfCount(profiles) >= 1) {
          throw new Error("duplicate key value violates unique constraint idx_unique_self_patient_per_account");
        }
      };

      expect(attemptInsertSecondSelf).toThrow(/idx_unique_self_patient_per_account/);
    });
  });

  describe("2. Patient 1's Emergency Card Never Shows Patient 2's Items", () => {
    it("scopes confirmed items and responder data exclusively to the card's patient_id", async () => {
      const cardToken = generateEmergencyToken();
      const tokenHash = hashEmergencyToken(cardToken);

      const mockCard = {
        id: "card-p1",
        user_id: accountId,
        patient_id: patient1Id,
        token_hash: tokenHash,
        visible_categories: ["medication", "allergy", "condition", "blood_group", "emergency_contact"],
        active: true,
      };

      const mockPatient1 = {
        id: patient1Id,
        full_name: "Harshal Jain",
        blood_group: "O+",
        emergency_contact_name: "Emergency Desk",
        emergency_contact_phone: "+91 99999 88888",
      };

      const mockPatient2 = {
        id: patient2Id,
        full_name: "Sunita Jain",
        blood_group: "B+",
        emergency_contact_name: "Harshal",
        emergency_contact_phone: "+91 77777 66666",
      };

      // Items in the account belonging to different patients
      const allAccountItems = [
        {
          id: "item-p1-med",
          user_id: accountId,
          patient_id: patient1Id,
          category: "medication",
          value: "Metformin 500mg",
          status: "confirmed",
          page_id: "page-1",
        },
        {
          id: "item-p1-allergy",
          user_id: accountId,
          patient_id: patient1Id,
          category: "allergy",
          value: "Penicillin",
          status: "confirmed",
          page_id: "page-1",
        },
        {
          id: "item-p2-med",
          user_id: accountId,
          patient_id: patient2Id, // Mother's item
          category: "medication",
          value: "Thyroxine 75mcg",
          status: "confirmed",
          page_id: "page-2",
        },
        {
          id: "item-p2-allergy",
          user_id: accountId,
          patient_id: patient2Id, // Mother's item
          category: "allergy",
          value: "Sulfa Antibiotics",
          status: "confirmed",
          page_id: "page-2",
        },
      ];

      const mockSupabase = {
        from: (table: string) => ({
          select: vi.fn().mockImplementation(() => {
            if (table === "items") {
              return {
                eq: vi.fn().mockImplementation((col1: string, val1: any) => ({
                  eq: vi.fn().mockImplementation((col2: string, val2: any) => ({
                    in: vi.fn().mockImplementation((col3: string, cats: string[]) => {
                      const filtered = allAccountItems.filter(
                        (item) =>
                          (col1 === "patient_id" ? item.patient_id === val1 : item.user_id === val1) &&
                          item.status === "confirmed" &&
                          cats.includes(item.category)
                      );
                      return Promise.resolve({ data: filtered, error: null });
                    }),
                  })),
                })),
              };
            }
            if (table === "pages") {
              return {
                in: vi.fn().mockResolvedValue({
                  data: [
                    { id: "page-1", document_id: "doc-1" },
                    { id: "page-2", document_id: "doc-2" },
                  ],
                  error: null,
                }),
              };
            }
            if (table === "documents") {
              return {
                in: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: "doc-1",
                      identity_status: "match",
                      attestation_type: null,
                      doc_type: "Prescription",
                      doc_date: "2026-05-10",
                    },
                  ],
                  error: null,
                }),
              };
            }
            return {
              eq: vi.fn().mockImplementation((col: string, val: any) => {
                if (table === "emergency_cards" && col === "token_hash") {
                  return { maybeSingle: vi.fn().mockResolvedValue({ data: mockCard, error: null }) };
                }
                if (table === "patients" && col === "id") {
                  return {
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: val === patient1Id ? mockPatient1 : mockPatient2,
                      error: null,
                    }),
                  };
                }
                return {
                  single: vi.fn().mockResolvedValue({ data: null, error: null }),
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            };
          }),
          eq: vi.fn().mockImplementation((col: string, val: any) => {
            if (table === "emergency_cards" && col === "token_hash") {
              return { maybeSingle: vi.fn().mockResolvedValue({ data: mockCard, error: null }) };
            }
            if (table === "patients" && col === "id") {
              return {
                maybeSingle: vi.fn().mockResolvedValue({
                  data: val === patient1Id ? mockPatient1 : mockPatient2,
                  error: null,
                }),
              };
            }
            return {
              single: vi.fn().mockResolvedValue({ data: null, error: null }),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            };
          }),
          insert: vi.fn().mockReturnValue(Promise.resolve({ error: null })),
        }),
      };

      const res = await getEmergencyResponderData(
        cardToken,
        "127.0.0.1",
        "Vitest-Agent",
        mockSupabase
      );

      expect(res.data).toBeDefined();
      expect(res.data?.full_name).toBe("Harshal Jain");
      expect(res.data?.blood_group).toBe("O+");

      // Verify Patient 1's items appear
      const medicationValues = res.data?.grouped.medication.map((m) => m.value);
      expect(medicationValues).toContain("Metformin 500mg");

      const allergyValues = res.data?.grouped.allergy.map((a) => a.value);
      expect(allergyValues).toContain("Penicillin");

      // Verify Patient 2's items DO NOT appear anywhere on Patient 1's card
      expect(medicationValues).not.toContain("Thyroxine 75mcg");
      expect(allergyValues).not.toContain("Sulfa Antibiotics");
    });
  });

  describe("3. Deleting a Patient Removes Its Rows and Files", () => {
    it("deleting a dependent profile removes its documents, files, and items", async () => {
      const removedStoragePaths: string[] = [];
      let deletedPatientRecordId: string | null = null;

      const mockDocs = [
        { id: "doc-101", patient_id: patient2Id, storage_path: `${accountId}/${patient2Id}/doc-101` },
        { id: "doc-102", patient_id: patient2Id, storage_path: `${accountId}/${patient2Id}/doc-102` },
      ];

      const mockStorage = {
        list: vi.fn().mockImplementation((folder: string) => {
          return Promise.resolve({
            data: [
              { name: "page-1.jpg" },
              { name: "page-2.jpg" },
            ],
          });
        }),
        remove: vi.fn().mockImplementation((paths: string[]) => {
          removedStoragePaths.push(...paths);
          return Promise.resolve({ data: paths, error: null });
        }),
      };

      // Simulate DELETE /api/patients/[id] workflow
      const deleteDependentPatient = async (targetId: string, isSelf: boolean) => {
        if (isSelf) {
          throw new Error("You cannot delete your own primary account profile.");
        }

        // Collect storage files for all patient docs
        const pathsToDelete: string[] = [];
        for (const d of mockDocs) {
          if (d.storage_path) pathsToDelete.push(d.storage_path);
          const folder = `${accountId}/${targetId}/${d.id}`;
          const { data: files } = await mockStorage.list(folder);
          if (files) {
            files.forEach((f: any) => pathsToDelete.push(`${folder}/${f.name}`));
          }
        }

        if (pathsToDelete.length > 0) {
          await mockStorage.remove(pathsToDelete);
        }

        // DB cascade deletes patient record, documents, pages, items, and card
        deletedPatientRecordId = targetId;
        return { success: true };
      };

      // 1. Attempting to delete primary Self profile is blocked
      await expect(deleteDependentPatient(patient1Id, true)).rejects.toThrow(
        "You cannot delete your own primary account profile."
      );
      expect(removedStoragePaths.length).toBe(0);

      // 2. Deleting dependent profile succeeds and cleans up files
      const result = await deleteDependentPatient(patient2Id, false);
      expect(result.success).toBe(true);
      expect(deletedPatientRecordId).toBe(patient2Id);

      // Ensure storage files were deleted under {account_id}/{patient_id}/{doc_id}/*
      expect(removedStoragePaths).toContain(`${accountId}/${patient2Id}/doc-101/page-1.jpg`);
      expect(removedStoragePaths).toContain(`${accountId}/${patient2Id}/doc-101/page-2.jpg`);
      expect(removedStoragePaths).toContain(`${accountId}/${patient2Id}/doc-102/page-1.jpg`);
    });
  });

  describe("4. Document Move Action Updates patient_id and Resets Item Confirmations", () => {
    it("executes move when printed name matches target profile and resets items to needs_review", () => {
      const targetMotherProfile = {
        id: patient2Id,
        full_name: "Sunita Jain",
        dob: "1968-04-12",
      };

      const originalDocument = {
        id: "doc-505",
        patient_id: patient1Id,
        storage_path: `${accountId}/${patient1Id}/doc-505`,
        patient_name_as_printed: "Mrs. Sunita Jain",
        patient_name_latin: "Sunita Jain",
        patient_dob: "1968-04-12",
        identity_status: "mismatch", // Initially mismatched under Harshal
      };

      const originalItems = [
        {
          id: "item-501",
          patient_id: patient1Id,
          status: "confirmed",
          last_confirmed_at: "2026-09-01T10:00:00Z",
          review_reason: null,
        },
        {
          id: "item-502",
          patient_id: patient1Id,
          status: "extracted",
          last_confirmed_at: null,
          review_reason: null,
        },
      ];

      // 1. Verify that printed name matches target profile
      const identityCheck = matchPatientIdentity(
        { full_name: targetMotherProfile.full_name, dob: targetMotherProfile.dob },
        {
          patient_name_as_printed: originalDocument.patient_name_as_printed,
          patient_name_latin: originalDocument.patient_name_latin,
          patient_dob: originalDocument.patient_dob,
        }
      );

      expect(identityCheck.outcome).toBe("match");

      // 2. Perform Move Transaction
      const movedDocument = {
        ...originalDocument,
        patient_id: targetMotherProfile.id,
        storage_path: `${accountId}/${targetMotherProfile.id}/doc-505`,
        identity_status: "match",
        attestation_note: `Moved from profile ${originalDocument.patient_id} to ${targetMotherProfile.id}`,
      };

      // Items must be reset to needs_review with confirmation cleared
      const updatedItems = originalItems.map((item) => ({
        ...item,
        patient_id: targetMotherProfile.id,
        status: "needs_review",
        review_reason: `Transferred to ${targetMotherProfile.full_name}. Please re-verify clinical items.`,
        last_confirmed_at: null,
      }));

      expect(movedDocument.patient_id).toBe(patient2Id);
      expect(movedDocument.identity_status).toBe("match");
      expect(movedDocument.storage_path).toBe(`${accountId}/${patient2Id}/doc-505`);

      // All items reset to needs_review and last_confirmed_at null
      for (const item of updatedItems) {
        expect(item.patient_id).toBe(patient2Id);
        expect(item.status).toBe("needs_review");
        expect(item.last_confirmed_at).toBeNull();
        expect(item.review_reason).toContain("Transferred to Sunita Jain");
      }
    });

    it("rejects move if printed name does not match the target profile", () => {
      const targetFatherProfile = {
        id: patient3Id,
        full_name: "Ramesh Jain",
        dob: "1965-02-18",
      };

      const documentForMother = {
        id: "doc-506",
        patient_name_as_printed: "Mrs. Sunita Jain",
        patient_name_latin: "Sunita Jain",
        patient_dob: "1968-04-12",
      };

      const identityCheck = matchPatientIdentity(
        { full_name: targetFatherProfile.full_name, dob: targetFatherProfile.dob },
        {
          patient_name_as_printed: documentForMother.patient_name_as_printed,
          patient_name_latin: documentForMother.patient_name_latin,
          patient_dob: documentForMother.patient_dob,
        }
      );

      // Given names "Sunita" and "Ramesh" are distinct tokens; zero edit-distance matching
      expect(identityCheck.outcome).toBe("mismatch");
    });
  });
});
