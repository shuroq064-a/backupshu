"use client";

import { useEffect, useState } from "react";
import { userApi } from "@/lib/api";
import type { AddressLabel, SavedAddress, SavedAddressPayload } from "@/types";

type AddressFormState = {
  address: string;
  receiverName: string;
  contactNumber: string;
  houseFlat: string;
  blockArea: string;
  landmark: string;
  addressLabel: AddressLabel;
  customAddressLabel: string;
  isDefault: boolean;
};

const EMPTY_FORM: AddressFormState = {
  address: "",
  receiverName: "",
  contactNumber: "",
  houseFlat: "",
  blockArea: "",
  landmark: "",
  addressLabel: "Home",
  customAddressLabel: "",
  isDefault: false,
};

function toForm(address: SavedAddress): AddressFormState {
  return {
    address: address.address,
    receiverName: address.receiverName,
    contactNumber: address.contactNumber,
    houseFlat: address.houseFlat,
    blockArea: address.blockArea,
    landmark: address.landmark || "",
    addressLabel: address.addressLabel,
    customAddressLabel: address.customAddressLabel || "",
    isDefault: address.isDefault,
  };
}

function toPayload(form: AddressFormState): SavedAddressPayload {
  return {
    address: form.address.trim(),
    receiver_name: form.receiverName.trim(),
    contact_number: form.contactNumber.trim(),
    house_flat: form.houseFlat.trim(),
    block_area: form.blockArea.trim(),
    landmark: form.landmark.trim() || undefined,
    address_label: form.addressLabel,
    custom_address_label: form.addressLabel === "Other" ? form.customAddressLabel.trim() : undefined,
    is_default: form.isDefault,
  };
}

function displayLabel(address: SavedAddress) {
  return address.addressLabel === "Other"
    ? address.customAddressLabel || "Other"
    : address.addressLabel;
}

export function AddressBookSection() {
  const [addresses, setAddresses] = useState<SavedAddress[]>([]);
  const [form, setForm] = useState<AddressFormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function loadAddresses() {
    setIsLoading(true);
    setError("");
    try {
      setAddresses(await userApi.getAddresses());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saved addresses");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAddresses();
  }, []);

  function openCreateForm() {
    setForm({ ...EMPTY_FORM, isDefault: addresses.length === 0 });
    setEditingId(null);
    setIsFormOpen(true);
    setError("");
    setMessage("");
  }

  function openEditForm(address: SavedAddress) {
    setForm(toForm(address));
    setEditingId(address.id);
    setIsFormOpen(true);
    setError("");
    setMessage("");
  }

  function update<K extends keyof AddressFormState>(key: K, value: AddressFormState[K]) {
    setForm((current) => ({
      ...current,
      [key]: value,
      customAddressLabel: key === "addressLabel" && value !== "Other" ? "" : current.customAddressLabel,
    }));
  }

  function validate() {
    const required = [form.address, form.receiverName, form.contactNumber, form.houseFlat, form.blockArea];
    if (required.some((value) => !value.trim())) {
      return "Complete all required address details.";
    }
    if (form.addressLabel === "Other" && !form.customAddressLabel.trim()) {
      return "Enter a custom address label when Other is selected.";
    }
    return "";
  }

  async function saveAddress() {
    const validationError = validate();
    setError(validationError);
    setMessage("");
    if (validationError) return;

    setIsSaving(true);
    try {
      const payload = toPayload(form);
      const saved = editingId
        ? await userApi.updateAddress(editingId, payload)
        : await userApi.createAddress(payload);
      await loadAddresses();
      setIsFormOpen(false);
      setEditingId(null);
      setMessage(editingId ? "Address updated successfully" : "Address saved successfully");
      window.dispatchEvent(new CustomEvent("shuroqx-address-book-updated", { detail: saved }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save address");
    } finally {
      setIsSaving(false);
    }
  }

  async function deleteAddress(addressId: string) {
    setError("");
    setMessage("");
    try {
      await userApi.deleteAddress(addressId);
      await loadAddresses();
      setMessage("Address deleted successfully");
      window.dispatchEvent(new Event("shuroqx-address-book-updated"));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save address");
    }
  }

  const inputClass = "mt-1.5 w-full rounded-lg border border-outline-variant bg-surface px-3 py-2.5 text-sm text-on-surface outline-none focus:border-primary focus:ring-primary transition-soft";

  return (
    <div className="mb-4 rounded-xl border border-outline-variant bg-surface-container-lowest p-6 shadow-sm">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-headline-md text-headline-md text-on-surface">Address Book</h3>
          <p className="mt-1 text-xs text-on-surface-variant">Saved addresses are available during future bookings.</p>
        </div>
        <button
          onClick={openCreateForm}
          className="rounded-xl bg-primary px-4 py-2 text-xs font-semibold text-white transition-soft hover:opacity-90"
        >
          Add Address
        </button>
      </div>

      {message && <p className="mb-3 rounded-xl border border-primary/20 bg-primary-container/10 px-3 py-2 text-xs font-medium text-primary">{message}</p>}
      {error && <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{error}</p>}

      {isLoading ? (
        <div className="py-8 text-center text-sm text-on-surface-variant">Loading saved addresses...</div>
      ) : addresses.length === 0 ? (
        <div className="rounded-xl border border-dashed border-outline-variant px-4 py-6 text-center">
          <p className="text-sm font-semibold text-on-surface">No saved addresses yet</p>
          <p className="mt-1 text-xs text-on-surface-variant">Save one here or from the booking location flow.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {addresses.map((address) => (
            <div key={address.id} className="rounded-xl border border-outline-variant bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary-container px-3 py-1 text-xs font-bold text-on-primary-container">
                      {displayLabel(address)}
                    </span>
                    {address.isDefault && (
                      <span className="rounded-full bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">Default</span>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-semibold text-on-surface">{address.receiverName}</p>
                  <p className="mt-1 text-xs text-on-surface-variant">{address.contactNumber}</p>
                  <p className="mt-2 text-sm text-on-surface">{address.houseFlat}, {address.blockArea}</p>
                  {address.landmark && <p className="mt-1 text-xs text-on-surface-variant">Landmark: {address.landmark}</p>}
                  <p className="mt-1 text-xs text-on-surface-variant">{address.address}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <button onClick={() => openEditForm(address)} className="rounded-lg border border-outline-variant px-3 py-1.5 text-xs font-semibold text-primary transition-soft hover:bg-primary-container/10">Edit</button>
                  <button onClick={() => void deleteAddress(address.id)} className="rounded-lg border border-red-100 px-3 py-1.5 text-xs font-semibold text-red-500 transition-soft hover:bg-red-50">Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {isFormOpen && (
        <div className="mt-4 rounded-xl border border-outline-variant bg-surface p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-medium text-on-surface sm:col-span-2">Selected service location *<input value={form.address} onChange={(event) => update("address", event.target.value)} className={inputClass} required /></label>
            <label className="text-sm font-medium text-on-surface">Receiver Name *<input value={form.receiverName} onChange={(event) => update("receiverName", event.target.value)} className={inputClass} required /></label>
            <label className="text-sm font-medium text-on-surface">Contact Number *<input type="tel" value={form.contactNumber} onChange={(event) => update("contactNumber", event.target.value)} className={inputClass} required /></label>
            <label className="text-sm font-medium text-on-surface">House No./Flat No. *<input value={form.houseFlat} onChange={(event) => update("houseFlat", event.target.value)} className={inputClass} required /></label>
            <label className="text-sm font-medium text-on-surface">Block/Area *<input value={form.blockArea} onChange={(event) => update("blockArea", event.target.value)} className={inputClass} required /></label>
            <label className="text-sm font-medium text-on-surface sm:col-span-2">Landmark <span className="font-normal text-on-surface-variant">(optional)</span><input value={form.landmark} onChange={(event) => update("landmark", event.target.value)} className={inputClass} /></label>
          </div>

          <fieldset className="mt-3">
            <legend className="text-sm font-medium text-on-surface">Address label</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {(["Home", "Work", "Other"] as AddressLabel[]).map((label) => (
                <button key={label} type="button" onClick={() => update("addressLabel", label)} className={`rounded-xl border px-4 py-2 text-sm font-semibold transition-soft ${form.addressLabel === label ? "border-primary bg-primary text-white" : "border-outline-variant bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container-low"}`}>{label}</button>
              ))}
            </div>
          </fieldset>

          {form.addressLabel === "Other" && (
            <label className="mt-3 block text-sm font-medium text-on-surface">Custom address label *<input value={form.customAddressLabel} onChange={(event) => update("customAddressLabel", event.target.value)} className={inputClass} required /></label>
          )}

          <label className="mt-3 flex items-center gap-2 text-sm font-medium text-on-surface">
            <input type="checkbox" checked={form.isDefault} onChange={(event) => update("isDefault", event.target.checked)} className="h-4 w-4 rounded border-outline-variant text-primary" />
            Mark as default address
          </label>

          <div className="mt-4 flex gap-2">
            <button onClick={() => void saveAddress()} disabled={isSaving} className="flex-1 rounded-xl bg-primary py-2.5 text-sm font-semibold text-white transition-soft hover:opacity-90 disabled:opacity-60">
              {isSaving ? "Saving..." : editingId ? "Update Address" : "Save Address"}
            </button>
            <button onClick={() => setIsFormOpen(false)} className="rounded-xl border border-outline-variant px-4 py-2.5 text-sm font-semibold text-on-surface-variant transition-soft hover:bg-surface-container-low">
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
