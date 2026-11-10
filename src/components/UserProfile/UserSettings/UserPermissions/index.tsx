import Alert from '@app/components/Common/Alert';
import Button from '@app/components/Common/Button';
import LoadingSpinner from '@app/components/Common/LoadingSpinner';
import PageTitle from '@app/components/Common/PageTitle';
import PermissionEdit from '@app/components/PermissionEdit';
import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import ErrorPage from '@app/pages/_error';
import defineMessages from '@app/utils/defineMessages';
import { formatBytes } from '@app/utils/numberHelpers';
import { ArrowDownOnSquareIcon } from '@heroicons/react/24/outline';
import type {
  ManagedUsersResponse,
  StorageQuotaResponse,
  UserResultsResponse,
  UserStorageResponse,
} from '@server/interfaces/api/userInterfaces';
import axios from 'axios';
import { Form, Formik } from 'formik';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

const messages = defineMessages(
  'components.UserProfile.UserSettings.UserPermissions',
  {
    toastSettingsSuccess: 'Permissions saved successfully!',
    toastSettingsFailure: 'Something went wrong while saving settings.',
    permissions: 'Permissions',
    unauthorizedDescription: 'You cannot modify your own permissions.',
    managedusers: 'Manage requests of',
    managedusersDescription:
      'Select other users whose requests this user can view and delete.',
    storageQuota: 'Storage quota',
    storageQuotaDescription:
      'Maximum storage this user may consume across their requests. New downloads are blocked once reached; existing media is kept. 0 means unlimited.',
    storageQuotaUsage: 'Current usage: {usage}',
    storageQuotaSaved: 'Storage quota saved!',
  }
);

const UserPermissions = () => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const router = useRouter();
  const { user: currentUser } = useUser();
  const { user, revalidate: revalidateUser } = useUser({
    id: Number(router.query.userId),
  });
  const {
    data,
    error,
    mutate: revalidate,
  } = useSWR<{ permissions?: number }>(
    user ? `/api/v1/user/${user?.id}/settings/permissions` : null
  );

  const {
    data: managedUsers,
    mutate: revalidateManagedUsers,
  } = useSWR<ManagedUsersResponse>(
    user ? `/api/v1/user/${user.id}/managed_users` : null
  );
  const { data: allUsers } = useSWR<UserResultsResponse>(
    '/api/v1/user?take=100'
  );

  const { data: quotaData, mutate: revalidateQuota } =
    useSWR<StorageQuotaResponse>(
      user ? `/api/v1/user/${user.id}/storage_quota` : null
    );
  const { data: storageData } = useSWR<UserStorageResponse>(
    '/api/v1/user/storage'
  );
  const [quotaGb, setQuotaGb] = useState<string>('');

  useEffect(() => {
    if (quotaData) {
      setQuotaGb(String(quotaData.quotaGb));
    }
  }, [quotaData]);

  const saveQuota = async () => {
    try {
      await axios.post(`/api/v1/user/${user?.id}/storage_quota`, {
        quotaGb: Number(quotaGb),
      });
      addToast(intl.formatMessage(messages.storageQuotaSaved), {
        autoDismiss: true,
        appearance: 'success',
      });
    } catch {
      addToast(intl.formatMessage(messages.toastSettingsFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      revalidateQuota();
    }
  };

  const storageUsage =
    storageData?.users.find((u) => u.userId === user?.id)?.size ?? 0;

  const toggleManagedUser = async (targetId: number) => {
    const current = managedUsers?.userIds ?? [];
    const next = current.includes(targetId)
      ? current.filter((id) => id !== targetId)
      : [...current, targetId];

    try {
      await axios.post(`/api/v1/user/${user?.id}/managed_users`, {
        userIds: next,
      });
    } catch {
      addToast(intl.formatMessage(messages.toastSettingsFailure), {
        autoDismiss: true,
        appearance: 'error',
      });
    } finally {
      revalidateManagedUsers();
    }
  };

  if (!data && !error) {
    return <LoadingSpinner />;
  }

  if (!data) {
    return <ErrorPage statusCode={500} />;
  }

  if (currentUser?.id !== 1 && currentUser?.id === user?.id) {
    return (
      <>
        <div className="mb-6">
          <h3 className="heading">
            {intl.formatMessage(messages.permissions)}
          </h3>
        </div>
        <Alert
          title={intl.formatMessage(messages.unauthorizedDescription)}
          type="error"
        />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title={[
          intl.formatMessage(messages.permissions),
          intl.formatMessage(globalMessages.usersettings),
          user?.displayName,
        ]}
      />
      <div className="mb-6">
        <h3 className="heading">{intl.formatMessage(messages.permissions)}</h3>
      </div>
      <Formik
        initialValues={{
          currentPermissions: data?.permissions,
        }}
        enableReinitialize
        onSubmit={async (values) => {
          try {
            await axios.post(`/api/v1/user/${user?.id}/settings/permissions`, {
              permissions: values.currentPermissions ?? 0,
            });

            addToast(intl.formatMessage(messages.toastSettingsSuccess), {
              autoDismiss: true,
              appearance: 'success',
            });
          } catch {
            addToast(intl.formatMessage(messages.toastSettingsFailure), {
              autoDismiss: true,
              appearance: 'error',
            });
          } finally {
            revalidate();
            revalidateUser();
          }
        }}
      >
        {({ isSubmitting, setFieldValue, values }) => {
          return (
            <Form className="section">
              <div className="max-w-3xl">
                <PermissionEdit
                  actingUser={currentUser}
                  currentUser={user}
                  currentPermission={values.currentPermissions ?? 0}
                  onUpdate={(newPermission) =>
                    setFieldValue('currentPermissions', newPermission)
                  }
                />
              </div>
              <div className="actions">
                <div className="flex justify-end">
                  <span className="ml-3 inline-flex rounded-md shadow-sm">
                    <Button
                      buttonType="primary"
                      type="submit"
                      disabled={isSubmitting}
                    >
                      <ArrowDownOnSquareIcon />
                      <span>
                        {isSubmitting
                          ? intl.formatMessage(globalMessages.saving)
                          : intl.formatMessage(globalMessages.save)}
                      </span>
                    </Button>
                  </span>
                </div>
              </div>
            </Form>
          );
        }}
      </Formik>
      {user && (
        <div className="mt-8">
          <div className="mb-6">
            <h3 className="heading">
              {intl.formatMessage(messages.storageQuota)}
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              {intl.formatMessage(messages.storageQuotaDescription)}
            </p>
          </div>
          <div className="rounded-md border border-gray-700 bg-gray-800 p-4">
            <p className="mb-3 text-sm text-gray-300">
              {intl.formatMessage(messages.storageQuotaUsage, {
                usage: formatBytes(storageUsage),
              })}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="number"
                min={0}
                value={quotaGb}
                onChange={(e) => setQuotaGb(e.target.value)}
                className="short w-32"
              />
              <span className="text-sm text-gray-400">GB</span>
              <Button buttonType="primary" onClick={saveQuota}>
                {intl.formatMessage(globalMessages.save)}
              </Button>
            </div>
          </div>
        </div>
      )}
      {user && user.id !== 1 && (
        <div className="mt-8">
          <div className="mb-6">
            <h3 className="heading">
              {intl.formatMessage(messages.managedusers)}
            </h3>
            <p className="mt-2 text-sm text-gray-400">
              {intl.formatMessage(messages.managedusersDescription)}
            </p>
          </div>
          <div className="rounded-md border border-gray-700 bg-gray-800 p-4">
            {(allUsers?.results ?? [])
              .filter((u) => u.id !== user.id && u.id !== 1)
              .map((u) => (
                <label
                  key={`managed-user-${u.id}`}
                  className="flex cursor-pointer items-center space-x-3 py-1"
                >
                  <input
                    type="checkbox"
                    checked={(managedUsers?.userIds ?? []).includes(u.id)}
                    onChange={() => toggleManagedUser(u.id)}
                  />
                  <span>{u.displayName}</span>
                </label>
              ))}
          </div>
        </div>
      )}
    </>
  );
};

export default UserPermissions;
